/**
 *
 *
 * @export
 * @interface LineData
 */
export interface LineData {
    label: string;
    data: number[];
}
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
export declare function writeChartToFile(file: string, xData: any[], lines: LineData[], fileType?: string): Promise<void>;
