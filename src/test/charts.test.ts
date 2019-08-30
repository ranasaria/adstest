/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the Source EULA. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';
import 'mocha';
import { writeChartToFile, LineData } from '../charts';
import { getBoolean, jsonDump } from '../utils';
import assert = require('assert');
import * as os from 'os';
import * as uniqueFilename from 'unique-filename';
import * as debugLogger from 'debug';
import * as fs from 'fs';

const debug = debugLogger('unittest:charts');
const trace = debugLogger('unittest:charts:trace');

suite('Charts automation unit tests', function () {
	let testId = 1;
	const dataLength = 10;
	const max = 100;
	const maxLines = 20;

	const xData: number[] = Array.from({ length: dataLength }, (value, i) => i+1);
	const lines: LineData[] = Array.from({length: maxLines}, (value, i) => {
		const multiplier = Math.pow(10, Math.floor(Math.random() * 8));
		return {
			label: `${i+1}th Measure`,
			data: Array.from({ length: dataLength }, () => Math.random() * max * multiplier)
		}
	});
	
	// Basic Positive test for canonical use case.
	//
	test(`Positive Test:${testId++}:: ensures chart to file works for canonical case`, async function () {
		const fileType = 'png';
		const chartName = 'charts_test_ts';
		const file = `${uniqueFilename(os.tmpdir(), chartName)}.${fileType}`;  
		trace("chart file to generate:", file);		
		debug(`invoking writeChartToFile(${jsonDump(xData)}, ${jsonDump(lines)}, ${fileType}, ${file})`);
		const image: Buffer = await writeChartToFile(xData, lines, fileType, 0 /*start time*/, undefined /*xAxisLabel to use default */, file, chartName);
		trace(`test writeChartToFile done`);
		const stats = fs.statSync(file);
		trace(`chart file:${file} generated with size:${stats.size}`);
		assert(image !== undefined && image !== null && image.length > 0);		
		assert(fs.statSync(file).size > 0, `${file} should be of non-zero size`);
		
		if (!getBoolean(process.env.DontCleanupTestGeneratedFiles)) {
			fs.unlink(file, (err) => {
				if (err){
					throw err;
				}
			});
			trace(`chart file: ${file} has been deleted`);			
		};
	}).timeout(10000);
});
