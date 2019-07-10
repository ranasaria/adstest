"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : new P(function (resolve) { resolve(result.value); }).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the Source EULA. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
/**
 * This module contains all the definitions for drawing charts and writing them to a file.
*/
const chartjs_node_canvas_1 = require("chartjs-node-canvas");
const logPrefix = 'adstest:counters:charts';
const debug = require('debug')(logPrefix);
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
function writeChartToFile(xData, lines, fileType = 'png', file) {
    return __awaiter(this, void 0, void 0, function* () {
        //	let stream: { pipe: (arg0: any) => void; };
        const configuration = {
            // See https://www.chartjs.org/docs/latest/configuration        
            type: 'line',
            data: {
                labels: xData,
                datasets: [],
            }
        };
        const randomColor = require('randomcolor');
        lines.forEach((line) => {
            const color = require('color')(randomColor({ luminosity: 'bright' }));
            configuration.data.datasets.push({
                //fillColor: `${color.alpha(0.5)}`,
                fill: false,
                pointColor: `${color.alpha(1).darken(0.5)}`,
                strokeColor: `${color.alpha(1).lighten(0.1)}`,
                label: line.label,
                data: line.data,
            });
        });
        const width = 1600; //px
        const height = 900; //px
        const canvasRenderService = new chartjs_node_canvas_1.CanvasRenderService(width, height, (ChartJS) => {
            ChartJS.defaults.global.elements.line.fill = true;
            ChartJS.defaults.line.spanGaps = true;
            ChartJS.defaults.global.defaultColor = 'rgba(255,255,0,0.1)';
        });
        const mimeType = getMimeType(fileType);
        const image = yield canvasRenderService.renderToBuffer(configuration, mimeType);
        if (file) {
            const fs = require('fs');
            let fd;
            try {
                fd = fs.openSync(file, 'w');
                fs.writeSync(fd, image);
                debug(`The chart file:${file} was written out.`);
            }
            finally {
                fs.closeSync(fd);
            }
        }
        return image;
    });
}
exports.writeChartToFile = writeChartToFile;
function getMimeType(fileType) {
    switch (fileType.toLowerCase()) {
        case 'jpeg':
        case 'jpg':
            return 'image/jpeg';
        case 'png':
        default:
            return 'image/png';
    }
}
//# sourceMappingURL=charts.js.map