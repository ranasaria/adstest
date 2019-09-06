/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the Source EULA. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
/**
 * This script is the entry point of the code that is run in a separate 'node' process for collection of performance counters.
*/
'use strict';
import debugLogger = require('debug');

import { CollectorMethodType, CollectorResponse, ConstructCountersType, isConstructCountersType } from './remoteCollector';

import { Counters } from './counters';
import { jsonDump } from './utils';

const trace = debugLogger('adstest:collectionprocess:trace');

console.log("Process: " + process.argv[1] + " has now started.");
let counters: Counters;
const processMessage: NodeJS.MessageListener = async (message: any) => {
	trace('message from parent:', jsonDump(message));
	//console.log(`is message ConstructCountersType: ${message is ConstructCountersType}`)
	if (isConstructCountersType(message)) {
		message = message as ConstructCountersType;
		counters = new Counters(message.collectorName, message.pid, message.includeParent, message.skipCurrent, message.countersOptions);
		console.log(`counters object constructed`);
		process.send(CollectorResponse.ConstructionDone);
	} else if (message in CollectorMethodType) {
		await processCollectorMethod(message);
	} else {
		console.error(`unknown message: ${jsonDump(message)}`);
		throw Error(`unknown message: ${jsonDump(message)}`);
	}
}

process.on('message', processMessage);

async function processCollectorMethod(message: CollectorMethodType) {
	switch (message) {
		case CollectorMethodType.StartCounters:
			await counters.start();
			console.log(`counters collection started`);
			process.send(CollectorResponse.StartDone);
			break;
		case CollectorMethodType.StopCounters:
			await counters.stop();
			console.log(`counters collection stopped`);
			process.send(CollectorResponse.StopDone);
			break;
		default:
			console.error(`unknown message: ${jsonDump(message)}`);
			throw Error(`unknown message: ${jsonDump(message)}`);
	}
}

