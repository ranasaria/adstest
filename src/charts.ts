/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the Source EULA. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
/**
 * This module contains all the definitions for drawing charts and writing them to a file.
*/
import { CanvasRenderService, MimeType } from 'chartjs-node-canvas';
import { ChartConfiguration } from 'chart.js';
import { Color } from 'color';
//import { jsonDump } from './utils'

const logPrefix = 'adstest:counters:charts';
const debug = require('debug')(logPrefix);

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
 * @param {any[]} xData - array of labels (the x - coordinates/labels of the points)
 * @param {LineData[]} lines - array of {@link LineData} objects
 * @param {string} [fileType='png'] - supported values are 'png' or 'jpeg'. 'jpg' is considered synonym of 'jpeg'
 * @param {string} file - the file name to write out for the generated chart
 * @returns {Promise<void>}
 */
export async function writeChartToFile(xData: any[], lines: LineData[], fileType: string = 'png', file: string): Promise<Buffer> {
	//	let stream: { pipe: (arg0: any) => void; };
	const configuration: ChartConfiguration = {
		// See https://www.chartjs.org/docs/latest/configuration        
		type: 'line',
		options: {
			scales: {
				yAxes: [{
					ticks: {
						// Include a % sign in the ticks on y-axis
						callback: function(value, index, values) {
							return value + '%';
						}
					},
					max: 106
				}]
			},
			gridLines: {
				lineWidth: 5
			} 
		},
		data: {
			labels: xData,
			datasets: [],
		}
	};
	debug("lines.length:", lines.length);	
	const randomColor = require('randomcolor');

	const rColors: Color[] = randomColor({
		luminosity: 'bright', 
		format: 'rgb', 
		count: lines.length, 
		seed: 9
	});
	const colors: Color[] = rColors.map(rc => require('color')(rc));
	for (const [index, line] of lines.entries()) {
		const max: number = Math.max(...line.data);
		const min: number = Math.min(...line.data);
		const color: Color = colors[index];
		configuration.data.datasets.push({
			fill: false,
			borderColor: `${color}`,
			backgroundColor: `${color.alpha(0.7)}`,			
			borderWidth: 4,
			pointRadius: 6,
			pointBackgroundColor: '#fff', // white
			label: `${line.label}:1%=${(max-min)/100}`, // include the scaling factor in the label
			data: line.data.map(y => (y-min)*100/(max-min)), //convert y values to percentages
		});
	}
	const width = 1600; //px
	const height = 900; //px
	const canvasRenderService = new CanvasRenderService(width, height, (ChartJS) => {
		ChartJS.defaults.global.elements.line.fill = true;
		ChartJS.defaults.line.spanGaps = true;
		ChartJS.defaults.global.defaultFontColor = 'black';
		ChartJS.defaults.global.defaultFontStyle = 'bold';
		ChartJS.defaults.global.defaultFontSize = 16;
	});
	const mimeType: MimeType = getMimeType(fileType);
	const image: Buffer = await canvasRenderService.renderToBuffer(configuration, mimeType);	
	if (file) {
		const fs = require('fs');
		let fd;		
		try {
			fd = fs.openSync(file, 'w');
			fs.writeSync(fd, image);
			debug(`The chart file:${file} was written out.`);	
		} finally {
			fs.closeSync(fd);
		}
	}
	return image;
}

function getMimeType(fileType: string): MimeType {
	switch (fileType.toLowerCase()) {
		case 'jpeg':
		case 'jpg':
			return 'image/jpeg';
		case 'png':
		default:
			return 'image/png';
	}
}

