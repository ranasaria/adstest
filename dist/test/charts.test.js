/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the Source EULA. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : new P(function (resolve) { resolve(result.value); }).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
require("mocha");
const charts_1 = require("../charts");
const utils_1 = require("../utils");
const assert = require("assert");
const os = require("os");
const uniqueFilename = require("unique-filename");
const debugLogger = require("debug");
const fs = require("fs");
const debug = debugLogger('unittest:charts');
const trace = debugLogger('unittest:charts:trace');
suite('Charts automation unit tests', function () {
    let testId = 1;
    const dataLength = 10;
    const max = 100;
    const xData = Array.from({ length: dataLength }, (value, i) => i + 1);
    const lines = [
        {
            label: "1st Measure",
            data: Array.from({ length: dataLength }, () => Math.random() * max)
        },
        {
            label: "2nd Measure",
            data: Array.from({ length: dataLength }, () => Math.random() * max * 10)
        },
        {
            label: "3rd Measure",
            data: Array.from({ length: dataLength }, () => Math.random() * max * 100)
        },
        {
            label: "4th Measure",
            data: Array.from({ length: dataLength }, () => Math.random() * max * 1000)
        },
        {
            label: "5th Measure",
            data: Array.from({ length: dataLength }, () => Math.random() * max * 10000)
        },
        {
            label: "6th Measure",
            data: Array.from({ length: dataLength }, () => Math.random() * max * 100000)
        }
    ];
    // Basic Positive test for canonical use case.
    //
    test(`Positive Test:${testId++}:: ensures chart to file works for canonical case`, function () {
        return __awaiter(this, void 0, void 0, function* () {
            const fileType = 'png';
            const chartName = 'charts_test_ts';
            const file = `${uniqueFilename(os.tmpdir(), chartName)}.${fileType}`;
            trace("chart file to generate:", file);
            debug(`invoking writeChartToFile(${utils_1.jsonDump(xData)}, ${utils_1.jsonDump(lines)}, ${fileType}, ${file})`);
            const image = yield charts_1.writeChartToFile(xData, lines, fileType, undefined, file, chartName);
            trace(`test writeChartToFile done`);
            const stats = fs.statSync(file);
            trace(`chart file:${file} generated with size:${stats.size}`);
            assert(image !== undefined && image !== null && image.length > 0);
            assert(fs.statSync(file).size > 0, `${file} should be of non-zero size`);
            if (!utils_1.getBoolean(process.env.DontDeleteTestFiles)) {
                fs.unlink(file, (err) => {
                    if (err) {
                        throw err;
                    }
                    trace(`chart file: ${file} has been deleted`);
                });
            }
            ;
        });
    }).timeout(10000);
});
//# sourceMappingURL=charts.test.js.map