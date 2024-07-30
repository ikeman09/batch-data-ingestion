#!/usr/bin/env node
import "source-map-support/register";
import * as cdk from "aws-cdk-lib";
import { PrerequisitesStack } from "../lib/PrerequisitesStack";
import { DMSStack } from "../lib/DMSStack";
import { ScheduleStack } from "../lib/ScheduleStack";

const app = new cdk.App();

const prerequisite_stack = new PrerequisitesStack(app, "PrerequisitesStack", {
	env: {
		account: "enter-account-id",
		region: "enter-region",
	},
});

const dms_stack = new DMSStack(app, "DMSStack", {
	env: {
		account: "enter-account-id",
		region: "enter-region",
	},

	db_instance: prerequisite_stack.db_instance,
	landing_zone_bucket: prerequisite_stack.landing_zone_bucket,
});

new ScheduleStack(app, "ScheduleStack", {
	env: {
		account: "enter-account-id",
		region: "enter-region",
	},

	migration_task: dms_stack.migration_task,
});
