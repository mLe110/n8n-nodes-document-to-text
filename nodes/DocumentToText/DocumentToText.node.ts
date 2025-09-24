import type {
	IExecuteFunctions,
	INode,
	INodeExecutionData,
	INodeType,
	INodeTypeDescription,
} from 'n8n-workflow';
import { NodeConnectionType, NodeOperationError } from 'n8n-workflow';

const pdfjsLib = require('pdfjs-dist/legacy/build/pdf.mjs');
pdfjsLib.GlobalWorkerOptions.disableWorker = true;

import {
	createCanvas,
	Image as NapiImage,
	ImageData as NapiImageData,
	Path2D as NapiPath2D,
} from '@napi-rs/canvas';
import DOMMatrix from '@thednp/dommatrix';

(globalThis as any).Image = NapiImage;
(globalThis as any).ImageData = NapiImageData;
(globalThis as any).Path2D = NapiPath2D;
(globalThis as any).DOMMatrix = (globalThis as any).DOMMatrix || DOMMatrix;

const canvasFactory = {
	create(width: number, height: number) {
		const canvas = createCanvas(Math.max(1, Math.floor(width)), Math.max(1, Math.floor(height)));
		const context = canvas.getContext('2d');
		return { canvas, context } as { canvas: any; context: any };
	},
	reset(canvasAndContext: { canvas: any; context: any }, width: number, height: number) {
		canvasAndContext.canvas.width = Math.max(1, Math.floor(width));
		canvasAndContext.canvas.height = Math.max(1, Math.floor(height));
	},
	destroy(canvasAndContext: { canvas: any; context: any }) {
		canvasAndContext.canvas = null;
		canvasAndContext.context = null;
	},
};

export class DocumentToText implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'Document To Text',
		name: 'documentToText',
		icon: 'file:DocumentToText.svg',
		group: ['input'],
		version: 1,
		description: 'Converts documents to text using Azure Open AI',
		defaults: {
			name: 'Document To Text',
		},
		inputs: [NodeConnectionType.Main],
		outputs: [NodeConnectionType.Main],
		usableAsTool: true,
		credentials: [
			{
				name: 'azureOpenAiApi',
				required: true,
			},
		],
		properties: [
			{
				displayName: 'Document',
				name: 'documentBinary',
				type: 'string',
				default: '',
				required: true,
				description: 'The document to convert to text in binary format',
			},
			{
				displayName: 'Model (Deployment) Name',
				name: 'modelName',
				type: 'string',
				default: '',
				required: true,
				description: 'The name of the model(deployment) to use (e.g., gpt-4, gpt-35-turbo)',
			},
			{
				displayName: 'System Prompt',
				name: 'systemPrompt',
				type: 'string',
				typeOptions: {
					rows: 4,
				},
				default:
					"You are a pdf to text transformer. Your task is to output the content of the pdf in textual form. Don't summarize the text and return it as it is in the pdf. Images, tables, etc. should be in the exact form as they are in the pdf only using text. For images this means that you should describe the image in text. Make sure that the image description is within the text of the page where the image is located.",
				required: true,
				description: 'The system prompt to use for the Azure Open AI model',
			},
			{
				displayName: 'Scale (Render Zoom)',
				name: 'scale',
				type: 'number',
				default: 1.6,
				typeOptions: { minValue: 0.5, maxValue: 3, step: 0.1 },
				description: 'Rendering zoom (~DPI). 1.6 is a good default.',
			},
			{
				displayName: 'Temperature',
				name: 'temperature',
				type: 'number',
				default: 0.2,
			},
			{
				displayName: 'Max Parallel Requests',
				name: 'maxParallelRequests',
				type: 'number',
				default: 1,
			},
		],
	};
	helpers: any;

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const items = this.getInputData();
		const returnItems: INodeExecutionData[] = [];

		const systemPrompt = this.getNodeParameter('systemPrompt', 0) as string;
		const modelName = this.getNodeParameter('modelName', 0) as string;
		const creds = await this.getCredentials('azureOpenAiApi');
		const endpoint = String(creds.endpoint);
		const apiKey = String(creds.apiKey);
		const apiVersion = String(creds.apiVersion || '2024-02-15-preview');

		const scale = this.getNodeParameter('scale', 0) as number;
		const temperature = this.getNodeParameter('temperature', 0) as number;
		const maxParallelRequests = this.getNodeParameter('maxParallelRequests', 0) as number;

		this.logger?.info('Document To Text', {
			node: this.getNode().name,
			modelName,
			systemPrompt,
			items,
		});

		for (let i = 0; i < items.length; i++) {
			const documentBinary = this.getNodeParameter('documentBinary', i) as string;
			const documentBuffer = Buffer.from(documentBinary, 'base64');

			const pages = await renderPdfToPngBuffers(documentBuffer, scale);

			if (pages.length === 0) {
				throw new NodeOperationError(this.getNode(), 'PDF has zero pages after rendering.');
			}

			let merged = '';
			for (let p = 0; p < pages.length; p += maxParallelRequests) {
				const batch = pages.slice(p, p + maxParallelRequests);

				const requestBodies = batch.map((b, idx) => ({
					messages: [
						{ role: 'system', content: systemPrompt },
						{
							role: 'user',
							content: [
								{ type: 'text', text: `Page ${p + idx + 1}:` },
								{
									type: 'image_url',
									image_url: { url: `data:image/png;base64,${b.toString('base64')}` },
								},
							],
						},
					],
					temperature,
				}));

				try {
					const responses = await Promise.all(
						requestBodies.map((body) =>
							callAzureOpenAi(endpoint, modelName, apiVersion, apiKey, body, this.getNode()),
						),
					);

					merged += responses.map((r) => r.choices[0].message.content).join('\n\n');
				} catch (error) {
					throw new NodeOperationError(this.getNode(), error);
				}
			}

			const output = merged.trim();
			const out: INodeExecutionData = {
				json: { output, pages: pages.length },
			};

			returnItems.push(out);
		}

		return [returnItems];
	}
}

/** ---------- Helpers ---------- */

async function callAzureOpenAi(
	endpoint: string,
	modelName: string,
	apiVersion: string,
	apiKey: string,
	body: any,
	node: INode,
): Promise<any> {
	const base = (endpoint || '').trim();
	const baseWithSlash = base.endsWith('/') ? base : base + '/';
	const url = `${baseWithSlash}openai/deployments/${encodeURIComponent(modelName)}/chat/completions?api-version=${encodeURIComponent(apiVersion)}`;

	try {
		const res = await fetchWithRetry(url, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				'api-key': apiKey,
			} as any,
			body: JSON.stringify(body),
		});

		if (!res.ok) {
			const t = await res.text();
			throw new NodeOperationError(node, `Azure OpenAI error ${res.status}: ${t}`);
		}
		const data = await res.json();
		return data;
	} catch (error) {
		throw new NodeOperationError(
			node,
			`Error resolving response from Azure OpenAI: ${error instanceof Error ? error.message : String(error)}`,
		);
	}
}

interface RetryOptions {
	retries?: number;
	backoffMs?: number;
	retryOn?: number[];
}

function sleep(ms: number) {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchWithRetry(url: string, init?: any, options: RetryOptions = {}): Promise<any> {
	const { retries = 3, backoffMs = 500, retryOn = [429, 500, 502, 503, 504] } = options;

	let lastError: any;
	for (let attempt = 1; attempt <= retries; attempt++) {
		try {
			const res = await fetch(url, init as any);

			if (!res || typeof res.status !== 'number') {
				lastError = new Error('Invalid fetch response');
			} else if (!retryOn.includes(res.status)) {
				return res; // success or non-retryable HTTP status
			} else {
				lastError = new Error(`Retryable HTTP ${res.status}`);
			}
		} catch (err) {
			lastError = err;
		}

		if (attempt < retries) {
			const delay = backoffMs * Math.pow(2, attempt - 1);
			// eslint-disable-next-line no-console
			console.warn(`Fetch failed (attempt ${attempt}), retrying in ${delay}ms...`);
			await sleep(delay);
		}
	}

	throw lastError;
}

async function renderPdfToPngBuffers(pdfBuffer: Buffer, scale = 1.6): Promise<Buffer[]> {
	const loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(pdfBuffer) });
	const pdf = await loadingTask.promise;

	const out: Buffer[] = [];
	for (let p = 1; p <= pdf.numPages; p++) {
		const page = await pdf.getPage(p);
		const viewport = page.getViewport({ scale });

		const { canvas, context } = canvasFactory.create(viewport.width, viewport.height);

		await page.render({
			canvasContext: context,
			viewport,
			canvasFactory: canvasFactory,
		}).promise;

		out.push(await canvas.toBuffer('image/png'));
		canvasFactory.destroy({ canvas, context });
	}
	return out;
}
