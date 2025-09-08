import type {
	IExecuteFunctions,
	INodeExecutionData,
	INodeType,
	INodeTypeDescription,
} from 'n8n-workflow';
import { NodeConnectionType, NodeOperationError } from 'n8n-workflow';
//import { AzureOpenAI } from 'openai';
import '@azure/openai/types';

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

// CanvasFactory backed by @napi-rs/canvas
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
				displayName: 'Max Pages per Request',
				name: 'pagesPerRequest',
				type: 'number',
				default: 4,
			},
			{
				displayName: 'Temperature',
				name: 'temperature',
				type: 'number',
				default: 0.2,
			},
			{
				displayName: 'Attach Output as File',
				name: 'attachBinary',
				type: 'boolean',
				default: false,
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
		const pagesPerRequest = this.getNodeParameter('pagesPerRequest', 0) as number;
		const temperature = this.getNodeParameter('temperature', 0) as number;
		//const attachBinary = this.getNodeParameter('attachBinary', 0) as boolean;

		this.logger?.info('Document To Text', {
			node: this.getNode().name,
			modelName,
			systemPrompt,
			items,
		});

		for (let i = 0; i < items.length; i++) {
			const documentBinary = this.getNodeParameter('documentBinary', i) as string;
			const documentBuffer = Buffer.from(documentBinary, 'base64');
			//const documentBuffer = Buffer.from(pdfBin.data, pdfBin.encoding || 'base64');

			const pages = await renderPdfToPngBuffers(documentBuffer, scale);

			if (pages.length === 0) {
				throw new NodeOperationError(this.getNode(), 'PDF has zero pages after rendering.');
			}

			// ---- Batch call Azure OpenAI ----
			let merged = '';
			for (let p = 0; p < pages.length; p += pagesPerRequest) {
				const batch = pages.slice(p, p + pagesPerRequest);

				// todo ml check messages -> system + user
				const userContent: any[] = [
					//{
					//	type: 'text',
					//	text: systemPrompt,
					//},
					...batch.flatMap((b, idx) => [
						{ type: 'text', text: `Page ${p + idx + 1}:` },
						{
							type: 'image_url',
							image_url: { url: `data:image/png;base64,${b.toString('base64')}` },
						},
					]),
				];

				const body = {
					messages: [
						{ role: 'system', content: systemPrompt },
						{ role: 'user', content: userContent },
					],
					temperature,
					max_tokens: 4000,
				};

				// todo ml simplify
				const url = `${endpoint}openai/deployments/${encodeURIComponent(modelName)}/chat/completions?api-version=${encodeURIComponent(apiVersion)}`;
				const res = await fetch(url, {
					method: 'POST',
					headers: {
						'Content-Type': 'application/json',
						'api-key': apiKey,
					} as any,
					body: JSON.stringify(body),
				});

				if (!res.ok) {
					const t = await res.text();
					throw new NodeOperationError(this.getNode(), `Azure OpenAI error ${res.status}: ${t}`);
				}
				const data = await res.json();
				// todo ml fix
				merged += ((data as any)?.choices?.[0]?.message?.content ?? '') + '\n\n';
			}

			const output = merged.trim();
			const out: INodeExecutionData = {
				json: { output, pages: pages.length },
			};

			//if (attachBinary) {
			//	const ext = outputFormat === 'md' ? 'md' : outputFormat === 'html' ? 'html' : 'json';
			//	const buf = Buffer.from(
			//		outputFormat === 'json' ? JSON.stringify(JSON.parse(output), null, 2) : output,
			//		'utf-8',
			//	);
			//	out.binary = {
			//		output: {
			//			data: buf.toString('base64'),
			//			fileName: (pdfBin.fileName || 'output') + '.' + ext,
			//			mimeType:
			//				outputFormat === 'html'
			//					? 'text/html'
			//					: outputFormat === 'json'
			//						? 'application/json'
			//						: 'text/markdown',
			//		},
			//	};
			//}

			returnItems.push(out);
		}

		return [returnItems];
	}
}

/** ---------- Helpers ---------- */

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
