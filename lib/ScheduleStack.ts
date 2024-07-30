import * as cdk from "aws-cdk-lib";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as dms from "aws-cdk-lib/aws-dms";
import * as iam from "aws-cdk-lib/aws-iam";
import * as eventbridge from "aws-cdk-lib/aws-events";
import * as targets from "aws-cdk-lib/aws-events-targets";
import { Construct } from "constructs";

interface ScheduleStackProps extends cdk.StackProps {
	migration_task: dms.CfnReplicationTask;
}

export class ScheduleStack extends cdk.Stack {
	constructor(scope: Construct, id: string, props: ScheduleStackProps) {
		super(scope, id, props);

		const { migration_task } = props;

		// Create a Lambda function to start the replication task
		const scheduler_lambda = new lambda.Function(this, "SchedulerLambda", {
			runtime: lambda.Runtime.NODEJS_LATEST,
			handler: "index.handler",
			code: lambda.Code.fromInline(`
			const { DatabaseMigrationServiceClient, StartReplicationTaskCommand } = require("@aws-sdk/client-database-migration-service");
      const client = new DatabaseMigrationServiceClient({ region: '${this.region}' });


			exports.handler = async (event) => {
				const command = new StartReplicationTaskCommand({
					ReplicationTaskArn: '${migration_task.ref}',
					StartReplicationTaskType: 'reload-target',
				});

				try {
					await client.send(command);
					console.log('Replication task started');
				} catch (error) {
					console.error('Error starting replication task:', error);
				}
			};
      `),
			initialPolicy: [
				new iam.PolicyStatement({
					actions: ["dms:StartReplicationTask"],
					resources: [migration_task.ref],
				}),
			],
		});

		// Create an EventBridge rule to trigger the Lambda function daily
		const scheduler_rule = new eventbridge.Rule(this, "SchedulerRule", {
			schedule: eventbridge.Schedule.rate(cdk.Duration.days(1)),
		});

		// Add the Lambda function as a target to the EventBridge rule
		scheduler_rule.addTarget(new targets.LambdaFunction(scheduler_lambda));

		// Edit lambda resource policy to allow EventBridge to invoke it
		scheduler_lambda.addPermission("EventBridgePermission", {
			principal: new iam.ServicePrincipal("events.amazonaws.com"),
			sourceArn: scheduler_rule.ruleArn,
			action: "lambda:InvokeFunction",
		});
	}
}
