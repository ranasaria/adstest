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
const utils_1 = require("./utils");
const logPrefix = 'adstest:counters:charts';
const debug = require('debug')(logPrefix);
/**
 *
 *
 * @export
 * @param {number[]} xData - array of labels (the x - coordinates/labels of the points)
 * @param {LineData[]} lines - array of {@link LineData} objects
 * @param {string} [fileType='png'] - supported values are 'png' or 'jpeg'. 'jpg' is considered synonym of 'jpeg'
 * @param {string} file - the file name to write out for the generated chart
 * @returns {Promise<void>}
 */
function writeChartToFile(xData, lines, fileType = 'png', startTimeStamp = 0, xAxisLabel = 'elapsed(ms)', file = null, title = null) {
    return __awaiter(this, void 0, void 0, function* () {
        xAxisLabel = `${xAxisLabel}, Start time:${utils_1.toDateTimeString(startTimeStamp)}`;
        xData = xData.map(x => x - xData[0]);
        const configuration = {
            // See https://www.chartjs.org/docs/latest/configuration        
            type: 'line',
            options: {
                title: {
                    display: !!(title),
                    fontColor: 'Red',
                    fontStyle: 'Bold',
                    fontSize: 50,
                    position: 'bottom',
                    text: title
                },
                scales: {
                    xAxes: [{
                            gridLines: {
                                lineWidth: 10
                            },
                            display: true,
                            scaleLabel: {
                                display: true,
                                labelString: xAxisLabel
                            },
                        }],
                    yAxes: [{
                            ticks: {
                                // Include a % sign in the ticks on y-axis
                                callback: function (value, index, values) {
                                    return value + '%';
                                }
                            },
                            gridLines: {
                                lineWidth: 10
                            },
                            max: 130
                        }]
                },
            },
            data: {
                labels: xData,
                datasets: [],
            }
        };
        debug("lines:", utils_1.jsonDump(lines));
        debug("empty configuration", utils_1.jsonDump(configuration));
        //const colors: Color[] = getColor(lines);
        for (const [index, line] of lines.entries()) {
            debug(`index: ${index}, line: ${utils_1.jsonDump(line)}`);
            let min = Math.min(...line.data);
            let max = Math.max(...line.data);
            let data = line.data;
            let label = line.label;
            if (min == max) {
                // place it a random location between 0 and 100, since we have horizontal lines and we do not want all lines to overlap
                const randomShift = Math.ceil(Math.random() * 50);
                label = `${line.label}:${randomShift.toPrecision(3)}%=${min} & zero at:0`;
                data = line.data.map(y => randomShift);
            }
            else {
                //convert data values to percentages
                label = `${line.label}:1%=${((max - min) / 100).toPrecision(3)} & zero at:${min.toPrecision(3)}`;
                data = line.data.map(y => (y - min) * 100 / (max - min));
            }
            const color = getColor(index);
            configuration.data.datasets.push({
                fill: false,
                borderColor: `${color}`,
                backgroundColor: `${color.alpha(0.7)}`,
                borderWidth: 4,
                pointRadius: 6,
                pointBackgroundColor: '#fff',
                label: label,
                data: data.map((value, index) => { return { x: xData[index], y: value }; })
            });
        }
        debug("filled out configuration", utils_1.jsonDump(configuration));
        const width = 1600; //px
        const height = 900; //px
        const canvasRenderService = new chartjs_node_canvas_1.CanvasRenderService(width, height, (ChartJS) => {
            ChartJS.defaults.global.elements.line.fill = true;
            ChartJS.defaults.line.spanGaps = true;
            ChartJS.defaults.global.defaultFontColor = 'black';
            ChartJS.defaults.global.defaultFontStyle = 'bold';
            ChartJS.defaults.global.defaultFontSize = 16;
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
const pallette = ['darkorange', 'deeppink', 'forestgreen', 'brown', 'blue', 'darkgreen', 'goldenrod', 'darkcyan', 'red', 'darkmagenta', 'black', 'hotpink'];
function getColor(index) {
    const color = require('color');
    if (index < pallette.length) {
        return color(pallette[index]);
    }
    else {
        const randomColor = require('randomcolor');
        return color(randomColor({
            format: 'rgb',
        }));
    }
}
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