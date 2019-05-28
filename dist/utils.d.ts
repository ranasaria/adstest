/**
 * Enumeration for various kinds of test suites that we support in our test system.
 */
export declare enum SuiteType {
    Integration = "Integration",
    Perf = "Perf",
    Stress = "Stress"
}
/**
* This simulates a sleep where the thread is suspended without spinning for a given number of milliseconds before resuming
*/
export declare function sleep(ms: number): Promise<{}>;
/**
* This is just a synonym for sleep(0). This has the affect of yielding to other operations.
*/
export declare function bear(): Promise<{}>;
/**
 * gets the suiteType as defined by the environment variable {@link SuiteType}
 * @returns - returns a value of type {@link SuiteType}
 */
export declare function getSuiteType(): SuiteType;
/**
 * returns the pretty formatted JSON string for the {@link object} provided.
 * @param object the object to dump
 */
export declare const jsonDump: (object: any) => string;
