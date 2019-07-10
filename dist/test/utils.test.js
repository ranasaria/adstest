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
const utils_1 = require("../utils");
const assert = require("assert");
const trace = require('debug')('unittest:utils:trace');
class UtilsTester {
    static randomString(length = 8) {
        // ~~ is double bitwise not operator which is a faster substitute for Math.floor() for positive numbers.
        //	Techinically ~~ just removes everything to the right of decimal point.
        //
        return [...Array(length)].map(i => (~~(Math.random() * 36)).toString(36)).join('');
    }
    environmentVariableSuiteTypeTest(x) {
        let environmentVariable = 'SuiteType';
        let origSuiteType = process.env[environmentVariable];
        try {
            if (x.environmentVariableValue === 'deleted') {
                delete process.env[environmentVariable];
                trace(`deleting env[${environmentVariable}]`);
            }
            else {
                process.env[environmentVariable] = x.environmentVariableValue;
                trace(`setting process.env[${environmentVariable}] to: ${x.environmentVariableValue}`);
            }
            const suiteType = utils_1.getSuiteType();
            trace(`suiteType evaluated to: ${suiteType} by getSuiteType() function`);
            assert.equal(suiteType, x.expected);
        }
        finally {
            process.env.SuiteType = origSuiteType;
        }
    }
}
suite('Utils automation unit tests', function () {
    //Environment Variable Tests
    //
    const absentValues = ['deleted', undefined, null, ''];
    let testId = 1;
    absentValues.forEach(valueDim => {
        test(`environmentVariable Test:${testId++}:: environmentVariable SuiteType is set to ##{${valueDim}}## should default to ${utils_1.SuiteType.Integration}`, function () {
            return __awaiter(this, void 0, void 0, function* () {
                (new UtilsTester()).environmentVariableSuiteTypeTest({ 'environmentVariableValue': valueDim, 'expected': utils_1.SuiteType.Integration });
            });
        });
    });
    const envSuiteTypeTests = [
        {
            'testDescription': `environmentVariable Test:${testId++}::environmentVariable SuiteType set to random string which is not ${utils_1.SuiteType.Stress} or ${utils_1.SuiteType.Perf} should default to ${utils_1.SuiteType.Integration}`,
            'environmentVariableValue': `${UtilsTester.randomString()}`,
            'expected': utils_1.SuiteType.Integration
        },
        {
            'testDescription': `environmentVariable Test:${testId++}::environmentVariable SuiteType set to ${utils_1.SuiteType.Stress} string should result in ${utils_1.SuiteType.Stress}`,
            'environmentVariableValue': 'sTreSS',
            'expected': utils_1.SuiteType.Stress
        },
        {
            'testDescription': `environmentVariable Test:${testId++}::environmentVariable SuiteType set to ${utils_1.SuiteType.Stress} string should result in ${utils_1.SuiteType.Perf}`,
            'environmentVariableValue': 'PErf',
            'expected': utils_1.SuiteType.Perf
        },
    ];
    envSuiteTypeTests.forEach(tst => {
        test(tst.testDescription, function () {
            return __awaiter(this, void 0, void 0, function* () {
                (new UtilsTester()).environmentVariableSuiteTypeTest(tst);
            });
        });
    });
});
//# sourceMappingURL=utils.test.js.map