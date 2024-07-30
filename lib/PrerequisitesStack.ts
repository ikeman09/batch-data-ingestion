import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";
import * as rds from "aws-cdk-lib/aws-rds";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as s3 from "aws-cdk-lib/aws-s3";

export class PrerequisitesStack extends cdk.Stack {
	public readonly db_instance: rds.DatabaseInstance;
	public readonly landing_zone_bucket: s3.Bucket;

	constructor(scope: Construct, id: string, props?: cdk.StackProps) {
		super(scope, id, props);

		// Use the default VPC
		const vpc = ec2.Vpc.fromLookup(this, "VPC", {
			isDefault: true,
		});

		/**
		 * Note: the following code is to create a PUBLIC RDS instance.
		 * This is not recommended for production workloads.
		 */

		// Create a security group
		const security_group = new ec2.SecurityGroup(this, "SecurityGroup", {
			vpc,
			description: "Allow access to RDS instance",
			allowAllOutbound: true,
		});

		// Allow public access on port 5432 (PostgreSQL)
		security_group.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.tcp(5432));

		const parameter_group = new rds.ParameterGroup(this, "ParameterGroup", {
			engine: rds.DatabaseInstanceEngine.postgres({
				version: rds.PostgresEngineVersion.VER_15,
			}),
			parameters: {
				"rds.force_ssl": "0",
			},
		});

		// Create an RDS
		this.db_instance = new rds.DatabaseInstance(this, "PostgresRDSInstance", {
			// engine: rds.DatabaseInstanceEngine.POSTGRES,
			engine: rds.DatabaseInstanceEngine.postgres({
				version: rds.PostgresEngineVersion.VER_15,
			}),
			parameterGroup: parameter_group,
			// Generate the secret with admin username `postgres` and random password
			credentials: rds.Credentials.fromGeneratedSecret("postgres"),
			vpc,
			vpcSubnets: {
				subnetType: ec2.SubnetType.PUBLIC,
			},
			securityGroups: [security_group],
			instanceType: ec2.InstanceType.of(
				ec2.InstanceClass.BURSTABLE3, // This will depend on your region
				ec2.InstanceSize.MICRO
			),
			publiclyAccessible: true,
			removalPolicy: cdk.RemovalPolicy.DESTROY, // NOT recommended for production
			deletionProtection: false, // NOT recommended for production
		});

		// Create landing zone S3 bucket
		this.landing_zone_bucket = new s3.Bucket(this, "LandingZoneBucket", {
			removalPolicy: cdk.RemovalPolicy.DESTROY, // NOT recommended for production
			autoDeleteObjects: true, // NOT recommended for production
		});

		// Output the endpoint
		new cdk.CfnOutput(this, "RDSInstanceEndpoint", {
			value: this.db_instance.dbInstanceEndpointAddress,
		});
	}
}
