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
function writeChartToFile(file, xData, lines, fileType = 'png') {
    return __awaiter(this, void 0, void 0, function* () {
        let stream;
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
        (() => __awaiter(this, void 0, void 0, function* () {
            const width = 1600; //px
            const height = 900; //px
            const canvasRenderService = new chartjs_node_canvas_1.CanvasRenderService(width, height, (ChartJS) => {
                ChartJS.defaults.global.elements.line.fill = true;
                ChartJS.defaults.line.spanGaps = true;
            });
            stream = canvasRenderService.renderToStream(configuration);
        }))();
        const fs = require('fs');
        const out = fs.createWriteStream(file);
        stream.pipe(out);
        out.on('finish', () => console.log('The chart file was created.'));
        return;
    });
}
exports.writeChartToFile = writeChartToFile;
//# sourceMappingURL=charts.js.map