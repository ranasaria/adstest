/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the Source EULA. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
/**
 * This module contains all the definitions for execution of performance counters collection in a separate local 'node' process.
 * This servers two purposes:
 * 1. Our measurement is tainted by the cpu/memory usage of collection code itself.
 * 2. The host code being measured need not be 'node' target. It could be an electron target for example.
*/
'use strict';

import * as cp from 'child_process';
import * as path from 'path';

import { DeferredPromise, jsonDump } from './utils';

import { CountersOptions } from './counters';

import debugLogger = require('debug');

const trace = debugLogger('adstest:remotecollector:trace');

export type CollectorMessageType = ConstructCountersType | CollectorMethodType;

export enum CollectorMethodType {
	StartCounters,
	StopCounters
}

export enum CollectorResponse {
	ConstructionDone,
	StartDone,
	StopDone
}

export interface ConstructCountersType {
	collectorName: string;
	pid: number;
	includeParent: boolean;
	skipCurrent: boolean;
	countersOptions: CountersOptions
}

export function isConstructCountersType(input: any): boolean {
	trace(`isConstructCountersType called with ${jsonDump(input)}`);
	trace(`typeof input to isConstructCountersType: ${typeof input}`);
	return typeof input === 'object' && 'collectorName' in input && 'pid' in input && 'includeParent' in input && 'skipCurrent' in input && 'countersOptions' in input;
}
export class RemoteCollector {
	private readonly collectorProcess: cp.ChildProcess;
	private counterConstructionPromise: DeferredPromise<void>;
	private startPromise: DeferredPromise<void>;
	private stopPromise: DeferredPromise<void>;

	constructor(name: string, pid: number = process.pid, includeParent: boolean = true, skipCurrent: boolean = true, countersOptions: CountersOptions = {}) {
		const program = 'node';
		const parameters = [path.resolve('dist/collectionProcess.js')];
		const options: cp.SpawnOptions = {
			stdio: ['pipe', 'pipe', 'pipe', 'ipc']
		};

		this.collectorProcess = cp.spawn(program, parameters, options);
		const constructCountersMessage: ConstructCountersType = {
			collectorName: name,
			pid: pid,
			includeParent: includeParent,
			skipCurrent: skipCurrent,
			countersOptions: countersOptions
		}
		this.counterConstructionPromise = new DeferredPromise<void>();
		this.collectorProcess.send(constructCountersMessage);
		trace(`message sent to collector process: ${jsonDump(constructCountersMessage)}`);
		this.collectorProcess.on('message', (message: CollectorResponse) => {
			this.processMessage(message);
		});
		this.collectorProcess.stdout.on('data', data => {
			console.log(`collector process: ${data}`);
		});
		this.collectorProcess.stderr.on('data', data => {
			console.error(`collector process error: ${data}`);
		});
		this.collectorProcess.on('close', code => {
			console.log(`collector process closed all stdio with code: ${code}`);
		});
		this.collectorProcess.on('exit', code => {
			console.log(`collector process exited with code: ${code}`);
		});
		this.collectorProcess.on('error', error => {
			console.log(`collector process issued error: ${error}`);
		});
	}

	public async start(): Promise<void> {
		await this.counterConstructionPromise; //make sure that construction has finished.
		this.startPromise = new DeferredPromise<void>();
		this.collectorProcess.send(CollectorMethodType.StartCounters); // send the start counters message to the collector child process
		trace(`message sent to collector process: ${jsonDump(CollectorMethodType.StartCounters)}`);
		await this.startPromise; // await the start of counters collection to have finished.

	}

	public async stop(): Promise<void> {
		await this.startPromise; //make sure that start operation had finished.
		this.stopPromise = new DeferredPromise<void>();
		this.collectorProcess.send(CollectorMethodType.StopCounters); // send the stop counters message to the collector child process
		trace(`message sent to collector process: ${jsonDump(CollectorMethodType.StopCounters)}`);
		await this.stopPromise; // await the stop of counters collection to finish.
		this.collectorProcess.kill(); // kill the child collection process.
	}

	processMessage(message: CollectorResponse) {
		console.log(`response received from collector process: ${message}`);
		switch (message) {
			case CollectorResponse.ConstructionDone:
				this.counterConstructionPromise.resolve();
				break;
			case CollectorResponse.StartDone:
				this.startPromise.resolve();
				break;
			case CollectorResponse.StopDone:
				this.stopPromise.resolve();
				break;
			default:
				console.error(`unknown response: ${jsonDump(message)}`);
				throw Error(`unknown response: ${jsonDump(message)}`);
		}
	}
}