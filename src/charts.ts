/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the Source EULA. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
/**
 * This module contains all the definitions for drawing charts and writing them to a file.
*/
import { CanvasRenderService } from 'chartjs-node-canvas';


/**
 *
 *
 * @export
 * @interface LineData
 */
export interface LineData {
	label: string, 
	data: number[]
}

/**
 *
 *
 * @export
 * @param {string} file
 * @param {any[]} xData
 * @param {[]} lines
 * @param {string} [fileType='png']
 * @returns {Promise<void>}
 */
export async function writeChartToFile(file: string, xData: any[], lines: LineData[],  fileType:string = 'png'): Promise<void> {
	let stream: { pipe: (arg0: any) => void; };
	const configuration:{type:string, data: {labels:any[], datasets:any[]}} = {
		// See https://www.chartjs.org/docs/latest/configuration        
		type: 'line',
		data: {
			labels: xData,
			datasets: [],
		}
	};
	const randomColor = require('randomcolor');
	lines.forEach((line: LineData) => {
		const color = randomColor({
			format: 'rgb' // e.g. 'rgb(225,200,20)'
		 });
		configuration.data.datasets.push({ 
			fillColor: `rgba(${color[0]},${color[1]},${color[2]},0.5)`,
			pointColor: `rgba(${color[0]},${color[1]},${color[2]},1)`,			
			strokeColor: `rgba(${color[0]},${color[1]},${color[2]},1)`,
			label: line.label,
			data: line.data,
		});
	});
	(async () => {
		const width = 1600; //px
		const height = 900; //px
		const canvasRenderService = new CanvasRenderService(width, height, (ChartJS) => {
			ChartJS.defaults.global.elements.line.fill = true;
			ChartJS.defaults.line.spanGaps = true;
		 });
		stream = canvasRenderService.renderToStream(configuration);
	
	})();
	const fs = require('fs');
	const out = fs.createWriteStream(file);
	stream.pipe(out);
	out.on('finish', () => console.log('The chart file was created.'));
	return;
	
}


