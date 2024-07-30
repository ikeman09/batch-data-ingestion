import * as cdk from "aws-cdk-lib";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as dms from "aws-cdk-lib/aws-dms";
import * as iam from "aws-cdk-lib/aws-iam";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as secretsmanager from "aws-cdk-lib/aws-secretsmanager";
import * as rds from "aws-cdk-lib/aws-rds";
import { Construct } from "constructs";

interface DmsStackProps extends cdk.StackProps {
	db_instance: rds.DatabaseInstance;
	landing_zone_bucket: s3.Bucket;
}

export class DMSStack extends cdk.Stack {
	public readonly source_endpoint: dms.CfnEndpoint;
	public readonly target_endpoint: dms.CfnEndpoint;
	public readonly migration_task: dms.CfnReplicationTask;

	constructor(scope: Construct, id: string, props: DmsStackProps) {
		super(scope, id, props);

		const { landing_zone_bucket, db_instance } = props;

		const db_secret = secretsmanager.Secret.fromSecretCompleteArn(
			this,
			"secret",
			db_instance.secret!.secretFullArn!
		);

		// Create a replication subnet group
		const replication_subnet_group = new dms.CfnReplicationSubnetGroup(
			this,
			"ReplicationSubnetGroup",
			{
				replicationSubnetGroupDescription: "Replication subnet group",
				replicationSubnetGroupIdentifier: "replication-subnet-group",
				subnetIds: db_instance.vpc.publicSubnets.map(
					(subnet) => subnet.subnetId
				),
			}
		);

		// Create a security group for DMS
		const replication_security_group = new ec2.SecurityGroup(
			this,
			"ReplicationSecurityGroup",
			{
				vpc: db_instance.vpc,
				description: "Allow access to DMS",
				allowAllOutbound: true,
			}
		);

		// Create a soure endpoint
		this.source_endpoint = new dms.CfnEndpoint(this, "DmsSourceEndpoint", {
			endpointIdentifier: "source-endpoint",
			endpointType: "source",
			engineName: "postgres",
			databaseName: "postgres", // Change this if your database name is different
			postgreSqlSettings: {
				secretsManagerSecretId: db_secret.secretArn,
				secretsManagerAccessRoleArn: new iam.Role(
					this,
					"DmsPostgresServiceRole",
					{
						assumedBy: new iam.ServicePrincipal(
							`dms.${this.region}.amazonaws.com`
						),
						managedPolicies: [
							iam.ManagedPolicy.fromAwsManagedPolicyName(
								"SecretsManagerReadWrite"
							),
						],
					}
				).roleArn,
			},
		});

		// Create a target endpoint
		this.target_endpoint = new dms.CfnEndpoint(this, "DmsTargetEndpoint", {
			endpointIdentifier: "target-endpoint",
			endpointType: "target",
			engineName: "s3",
			s3Settings: {
				bucketName: landing_zone_bucket.bucketName,
				serviceAccessRoleArn: new iam.Role(this, "DmsServiceRole", {
					assumedBy: new iam.ServicePrincipal(
						`dms.${this.region}.amazonaws.com`
					),
					managedPolicies: [
						iam.ManagedPolicy.fromAwsManagedPolicyName("AmazonS3FullAccess"),
					],
				}).roleArn,
			},
			extraConnectionAttributes: "DataFormat=csv",
		});

		// Create a DMS replication instance
		const replication_instance = new dms.CfnReplicationInstance(
			this,
			"DmsReplicationInstance",
			{
				// engineVersion: "3.5.3",
				replicationInstanceClass: "dms.t3.micro", // Free tier eligible
				allocatedStorage: 20,
				vpcSecurityGroupIds: [replication_security_group.securityGroupId],
				publiclyAccessible: true,
			}
		);

		// Create a replication task
		this.migration_task = new dms.CfnReplicationTask(
			this,
			"DmsReplicationTask",
			{
				migrationType: "full-load",
				replicationInstanceArn: replication_instance.ref,
				sourceEndpointArn: this.source_endpoint.ref,
				targetEndpointArn: this.target_endpoint.ref,
				tableMappings: JSON.stringify({
					rules: [
						{
							"rule-type": "selection",
							"rule-id": "1",
							"rule-name": "1",
							"rule-action": "include",
							"object-locator": {
								"schema-name": "public",
								"table-name": "%",
							},
						},
					],
				}),
				replicationTaskSettings: JSON.stringify({
					TargetMetadata: {
						TargetSchema: "", // Empty, since S3 does not use schemas
					},
					FullLoadSettings: {
						TargetTablePrepMode: "DROP_AND_CREATE", // For S3 target, files are overwritten
					},
					Logging: {
						EnableLogging: true,
					},
				}),
			}
		);
	}
}
