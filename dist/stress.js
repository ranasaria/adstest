/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the Source EULA. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
/**
 * This module contains all the definitions for Stress decorators and the utility functions and definitions thereof
*/
'use strict';
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : new P(function (resolve) { resolve(result.value); }).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
const class_validator_1 = require("class-validator");
const assert_1 = require("assert");
const utils_1 = require("./utils");
const assert = require("assert");
const util_1 = require("util");
const logPrefix = 'adstest:stress';
const debug = require('debug')(logPrefix);
const trace = require('debug')(`${logPrefix}:trace`);
/**
 * Subclass of Error to wrap any Error objects caught during Stress Execution.
 */
class StressError extends Error {
    constructor(error) {
        super();
        this.name = StressError.code;
        this.inner = error;
        if (error instanceof Error) {
            this.message = error.message;
            this.stack = error.stack;
        }
        else if (error instanceof String) {
            this.message = error.valueOf();
            try {
                throw new Error();
            }
            catch (e) {
                this.stack = e.stack;
            }
        }
        else if (util_1.isString(error)) {
            this.message = error;
            try {
                throw new Error();
            }
            catch (e) {
                this.stack = e.stack;
            }
        }
        else {
            this.message = 'unknown stress error';
        }
    }
}
StressError.code = 'ERR_STRESS';
exports.StressError = StressError;
/**
 * The default values for StressOptions.
 */
exports.DefaultStressOptions = { runtime: 7200, dop: 4, iterations: 50, passThreshold: 0.95 };
/**
 * A class with methods that help to implement the stressify decorator.
 * Keeping the core logic of stressification in one place as well as allowing this code to use
 * other decorators if needed.
 */
class Stress {
    /**
     * Constructor allows for construction with a bunch of optional parameters
     *
     * @param runtime - see {@link StressOptions}.
     * @param dop - see {@link StressOptions}.
     * @param iterations - see {@link StressOptions}.
     * @param passThreshold - see {@link StressOptions}.
     */
    constructor({ runtime, dop, iterations, passThreshold } = {}) {
        const trace = require('debug')(`${logPrefix}:constructor:trace`);
        trace(`parameters: runtime=${runtime}, dop=${dop}, iterations=${iterations}, passThreshold=${passThreshold}`);
        trace(`default properties this object at beginning of constructor: this.runtime=${this.runtime}, this.dop=${this.dop}, this.iterations=${this.iterations}, this.passThreshold=${this.passThreshold}`);
        this.runtime = Stress.getRuntime(runtime);
        this.dop = Stress.getDop(dop);
        this.iterations = Stress.getIterations(iterations);
        this.passThreshold = Stress.getPassThreshold(passThreshold);
        // validate this object
        //
        let validationErrors = class_validator_1.validateSync(this);
        if (validationErrors.length > 0) {
            trace(`throwing validationErrors::${utils_1.jsonDump(validationErrors)}`);
            throw validationErrors;
        }
        trace(`properties of this object post full construction with given parameters are: this.runtime=${this.runtime}, this.dop=${this.dop}, this.iterations=${this.iterations}, this.passThreshold=${this.passThreshold}`);
    }
    static getPassThreshold(input) {
        return utils_1.nullNanUndefinedEmptyCoalesce(input, utils_1.nullNanUndefinedEmptyCoalesce(parseFloat(process.env.StressPassThreshold), exports.DefaultStressOptions.passThreshold));
    }
    static getIterations(input) {
        return utils_1.nullNanUndefinedEmptyCoalesce(input, utils_1.nullNanUndefinedEmptyCoalesce(parseInt(process.env.StressIterations), exports.DefaultStressOptions.iterations));
    }
    static getDop(input) {
        return utils_1.nullNanUndefinedEmptyCoalesce(input, utils_1.nullNanUndefinedEmptyCoalesce(parseInt(process.env.StressDop), exports.DefaultStressOptions.dop));
    }
    static getRuntime(input) {
        return utils_1.nullNanUndefinedEmptyCoalesce(input, utils_1.nullNanUndefinedEmptyCoalesce(parseFloat(process.env.StressRuntime), exports.DefaultStressOptions.runtime));
    }
    /**
     *
     * @param originalMethod - The reference to the originalMethod that is being stressfied.The name of this method is {@link functionName}
     * @param originalObject - The reference to the object on which the {@link originalMethod} is invoked.
     * @param functionName - The name of the originalMethod that is being stressfied.
     * @param args - The invocation argument for the {@link originalMethod}
     * @param runtime - The desconstructed {@link StressOptions} parameter. see {@link StressOptions} for details.
     * @param dop - The desconstructed {@link StressOptions} parameter. see {@link StressOptions} for details.
     * @param iterations - The desconstructed {@link StressOptions} parameter. see {@link StressOptions} for details.
     * @param passThreshold - The desconstructed {@link StressOptions} parameter. see {@link StressOptions} for details.
     *
     * @returns - {@link StressResult}.
     */
    run(originalMethod, originalObject, functionName, args, { runtime, dop, iterations, passThreshold } = {}) {
        return __awaiter(this, void 0, void 0, function* () {
            trace(`run method called with parameters: originalMethod=${utils_1.jsonDump(originalMethod)} originalObject=${utils_1.jsonDump(originalObject)} functionName=${functionName}  args=${utils_1.jsonDump(args)}`);
            trace(`run method called with StressOptions: runtime=${runtime}, dop=${dop}, iterations=${iterations}, passThreshold=${passThreshold}`);
            runtime = utils_1.nullNanUndefinedEmptyCoalesce(runtime, this.runtime);
            dop = utils_1.nullNanUndefinedEmptyCoalesce(dop, this.dop);
            iterations = utils_1.nullNanUndefinedEmptyCoalesce(iterations, this.iterations);
            passThreshold = utils_1.nullNanUndefinedEmptyCoalesce(passThreshold, this.passThreshold);
            let numPasses = 0;
            let fails = [];
            let errors = [];
            let pendingPromises = [];
            const debug = require('debug')(`${logPrefix}:${functionName}`);
            debug(`Running Stress on ${functionName} with args: ('${args.join('\',\'')}') with runtime=${runtime}, dop=${dop}, iterations=${iterations}, passThreshold=${passThreshold}`);
            let timedOut = false;
            // Setup a timer to set timedOut to true when this.runtime number of seconds have elapsed.
            //
            trace(`Setting up a timer to expire after runtime of ${runtime * 1000} milliseconds`);
            let timer = setTimeout(() => {
                timedOut = true;
                trace(`flagging time out. ${runtime} seconds are up`);
            }, runtime * 1000);
            const IterativeLoop = (t) => __awaiter(this, void 0, void 0, function* () {
                const debug = require('debug')(`${logPrefix}:${functionName}:thread-${t}`);
                for (let i = 0; i < iterations; i++) {
                    debug(`starting iteration number: ${i}`);
                    try {
                        yield originalMethod.apply(originalObject, args);
                        debug(`iteration number=${i} passed`);
                        numPasses++;
                        utils_1.bear(); // bear (yield) to other threads so that timeout timer gets a chance to fire.
                        if (timedOut) {
                            debug(`timed out after ${i}th iteration, timeout of ${runtime} has expired `);
                            clearTimeout(timer);
                            timer.unref();
                            break; // break out of the loop
                        }
                    }
                    catch (err) {
                        // If failures can result in errors of other types apart from AssertionError then we will need to augument here
                        //
                        err instanceof assert_1.AssertionError
                            ? fails.push(err)
                            : errors.push(new StressError(err));
                        console.warn(`warn: iteration number=${i} on thread-${t} failed/errored with error: ${err}`);
                        debug(`iteration number=${i} failed/errored with error: ${err}`);
                    }
                }
            });
            // Invoke the iterative loop defined above in parallel without awaiting each individually
            //
            for (let t = 0; t < dop; t++) {
                pendingPromises.push(IterativeLoop(t));
            }
            // Now await all of the Promises for each of the above invocation.
            //
            yield Promise.all(pendingPromises).catch(fatalError => {
                debug(`A fatal error was encountered running stress thread: ${utils_1.jsonDump(fatalError)}`);
                throw fatalError;
            });
            let total = numPasses + errors.length + fails.length;
            assert(numPasses >= passThreshold * total, `Call Stressified: ${functionName}(${args.join(',')}) failed with a expected pass percent of ${passThreshold * 100}, actual pass percent is: ${numPasses * 100 / total}`);
            return { numPasses: numPasses, fails: fails, errors: errors };
        });
    }
}
Stress.MaxIterations = 1000000;
Stress.MaxRuntime = 72000;
Stress.MaxDop = 40;
Stress.MaxPassThreshold = 1;
__decorate([
    class_validator_1.IsDefined(),
    class_validator_1.IsInt(),
    class_validator_1.Min(0),
    class_validator_1.Max(Stress.MaxIterations),
    __metadata("design:type", Number)
], Stress.prototype, "iterations", void 0);
__decorate([
    class_validator_1.IsDefined(),
    class_validator_1.Min(0),
    class_validator_1.Max(Stress.MaxRuntime),
    __metadata("design:type", Number)
], Stress.prototype, "runtime", void 0);
__decorate([
    class_validator_1.IsDefined(),
    class_validator_1.IsInt(),
    class_validator_1.Min(1),
    class_validator_1.Max(Stress.MaxDop),
    __metadata("design:type", Number)
], Stress.prototype, "dop", void 0);
__decorate([
    class_validator_1.IsDefined(),
    class_validator_1.Min(0),
    class_validator_1.Max(Stress.MaxPassThreshold),
    __metadata("design:type", Number)
], Stress.prototype, "passThreshold", void 0);
exports.Stress = Stress;
// the singleton Stress object.
//
const stresser = new Stress();
/**
 * Decorator Factory to return the Method Descriptor function that will stressify any test class method.
        * Using the descriptor factory allows us pass options to the discriptor itself separately from the arguments
        * of the function being modified.
 * @param runtime - The desconstructed {@link StressOptions} option. see {@link StressOptions} for details.
 * @param dop - The desconstructed {@link StressOptions} option. see {@link StressOptions} for details.
 * @param iterations - The desconstructed {@link StressOptions} option. see {@link StressOptions} for details.
 * @param passThreshold - The desconstructed {@link StressOptions} option. see {@link StressOptions} for details.
 */
function stressify({ runtime, dop, iterations, passThreshold } = {}) {
    // return the function that does the job of stressifying a test class method with decorator @stressify
    //
    debug(`stressify FactoryDecorator called with runtime=${runtime}, dop=${dop}, iter=${iterations}, passThreshold=${passThreshold}`);
    // The actual decorator function that modifies the original target method pointed to by the memberDiscriptor
    //
    return function (memberClass, memberName, memberDescriptor) {
        // stressify the target function pointed to by the descriptor.value only if SuiteType is stress
        //
        const suiteType = utils_1.getSuiteType();
        debug(`Stressified Decorator called for: ${memberName} and suiteType=${suiteType}`);
        if (suiteType === utils_1.SuiteType.Stress) {
            debug(`Stressifying ${memberName} since env variable SuiteType is set to ${utils_1.SuiteType.Stress}`);
            // save a reference to the original method, this way we keep the values currently in the descriptor and not overwrite what another
            // decorator might have done to this descriptor by return the original descriptor.
            //
            const originalMethod = memberDescriptor.value;
            //modifying the descriptor's value parameter to point to a new method which is the stressified version of the originalMethod
            //
            memberDescriptor.value = function (...args) {
                return __awaiter(this, void 0, void 0, function* () {
                    // note usage of originalMethod here
                    //
                    const result = yield stresser.run(originalMethod, this, memberName, args, { runtime, dop, iterations, passThreshold });
                    debug(`Stressified: ${memberName}(${args.join(',')}) returned: ${utils_1.jsonDump(result)}`);
                    return result;
                });
            };
        }
        // return the original discriptor unedited so that the method pointed to it remains the same as before
        // the method pointed to by this descriptor was modifed to a stressified version of the origMethod if SuiteType was Stress.
        //
        return memberDescriptor;
    };
}
exports.stressify = stressify;
//# sourceMappingURL=stress.js.map