/**
 * Subclass of Error to wrap any Error objects caught during Stress Execution.
 */
export declare class StressError extends Error {
    inner: Error | any;
    static code: string;
    constructor(error?: any);
}
/**
 * Defines an interface to specify the stress options for stress tests.
 * @param runtime - the number of seconds (fractional values are allowed, least count is 1 millisecond) for which the stress runs. Once this 'runtime' expires stress is terminated even if we have not exceeded {@link iterations} count yet. Default value is provided by environment variable: StressRuntime and if undefined then by {@link DefaultStressOptions}.
 * @param dop - the number of parallel instances of the decorated method to run. Default value is provided by environment variable: StressDop and if undefined then by {@link DefaultStressOptions}.
 * @param iterations - the number of iterations to run in each parallel invocation for the decorated method. {@link runtime} can limit the number of iterations actually run. Default value is provided by environment variable: StressIterations and if undefined then by {@link DefaultStressOptions}.
 * @param passThreshold - the fractional number of all invocations of the decorated method that must pass to declared the stress invocation of that method to be declared passed. Range: 0.0-1.0. Default value is provided by environment variable: StressPassThreshold and if undefined then by {@link DefaultStressOptions}.
 */
export interface StressOptions {
    runtime?: number;
    dop?: number;
    iterations?: number;
    passThreshold?: number;
}
/**
 * The default values for StressOptions.
 */
export declare const DefaultStressOptions: StressOptions;
/**
 * Defines the shape of stress result object
 */
export interface StressResult {
    numPasses: number;
    fails: Error[];
    errors: Error[];
}
/**
 * A class with methods that help to implement the stressify decorator.
 * Keeping the core logic of stressification in one place as well as allowing this code to use
 * other decorators if needed.
 */
export declare class Stress {
    static readonly MaxIterations = 1000000;
    static readonly MaxRuntime = 72000;
    static readonly MaxDop = 40;
    static readonly MaxPassThreshold = 1;
    readonly iterations?: number;
    readonly runtime?: number;
    readonly dop?: number;
    readonly passThreshold?: number;
    /**
     * Constructor allows for construction with a bunch of optional parameters
     *
     * @param runtime - see {@link StressOptionsType}.
     * @param dop - see {@link StressOptionsType}.
     * @param iterations - see {@link StressOptionsType}.
     * @param passThreshold - see {@link StressOptionsType}.
     */
    constructor({ runtime, dop, iterations, passThreshold }?: StressOptions);
    private static getPassThreshold;
    private static getIterations;
    private static getDop;
    private static getRuntime;
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
    run(originalMethod: Function, originalObject: any, functionName: string, args: any[], { runtime, dop, iterations, passThreshold }?: StressOptions): Promise<StressResult>;
}
/**
 * Decorator Factory to return the Method Descriptor function that will stressify any test class method.
        * Using the descriptor factory allows us pass options to the discriptor itself separately from the arguments
        * of the function being modified.
 * @param runtime - The desconstructed {@link StressOptions} option. see {@link StressOptions} for details.
 * @param dop - The desconstructed {@link StressOptions} option. see {@link StressOptions} for details.
 * @param iterations - The desconstructed {@link StressOptions} option. see {@link StressOptions} for details.
 * @param passThreshold - The desconstructed {@link StressOptions} option. see {@link StressOptions} for details.
 */
export declare function stressify({ runtime, dop, iterations, passThreshold }?: StressOptions): (memberClass: any, memberName: string, memberDescriptor: PropertyDescriptor) => PropertyDescriptor;
