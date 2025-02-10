// publish-beta/validate-name-and-resource-length.ts

import path from 'node:path';
import { readFile } from 'node:fs/promises';

import debug from 'debug';

const log = debug('github-actions:publish-beta:validate-names');

interface S3Properties {
  Type: 'AWS::S3::Bucket';
  Properties: {
    BucketName: string;
  };
}

interface Resources {
  aws?: {
    s3?: Record<string, S3Properties>;
  };
}

export interface PackageJSON {
  service?: {
    name: string;
    resources?: Resources;
  };
}

const MAXIMUM_SERVICE_NAME_LENGTH = 20;

const MAXIMUM_S3_BUCKET_NAME_LENGTH = 20;

export async function readPackageJSON(rootProjectDirectory: string): Promise<PackageJSON> {
  const packageJSONPath = path.join(rootProjectDirectory, 'package.json');
  const packageJSON = await readFile(packageJSONPath, 'utf8');
  return JSON.parse(packageJSON) as PackageJSON;
}

async function validateS3BucketNames(input: Resources) {
  if (input.aws?.s3 === undefined) {
    log('package.json does not have a service.resources.aws.s3: {} property');
    return;
  }
  // allow override of s3 bucket name length from action environment
  const listOfS3BucketsFromEnvironment = process.env['S3_BUCKET_NAME_LENGTH_EXCEPTIONS'] ?? undefined;
  const S3_BUCKET_NAME_LENGTH_EXCEPTIONS =
    listOfS3BucketsFromEnvironment === undefined ? new Set() : new Set(listOfS3BucketsFromEnvironment.split(','));

  const s3Resources = input.aws.s3;

  const bucketNames = Object.values(s3Resources)
    .map((resource) => resource.Properties.BucketName)
    .filter((name) => !S3_BUCKET_NAME_LENGTH_EXCEPTIONS.has(name))
    .filter((name) => name.length > MAXIMUM_S3_BUCKET_NAME_LENGTH);

  if (bucketNames.length > 0) {
    throw new Error(
      `S3 bucket names are longer than ${MAXIMUM_S3_BUCKET_NAME_LENGTH} characters: ${JSON.stringify(bucketNames)}`,
    );
  }
}

export async function validateNameAndResourceLength(packageJSONWithResources: PackageJSON): Promise<void> {
  if (!packageJSONWithResources.service) {
    log('package.json does not have a service: {} property');
    return;
  }
  // allow override of service name length from action environment
  const SERVICE_NAME_LENGTH_EXCEPTION = process.env['SERVICE_NAME_LENGTH_EXCEPTION'] ?? undefined;
  const serviceName = packageJSONWithResources.service.name;

  if (SERVICE_NAME_LENGTH_EXCEPTION !== serviceName && serviceName.length > MAXIMUM_SERVICE_NAME_LENGTH) {
    const message = `Service name ${serviceName} is longer than ${MAXIMUM_SERVICE_NAME_LENGTH} characters`;
    log(message);
    throw new Error(message);
  }

  if (!packageJSONWithResources.service.resources?.aws) {
    log('package.json does not have a service.resources.aws: {} property');
    return;
  }
  const resources = packageJSONWithResources.service.resources;
  await validateS3BucketNames(resources);
}

export default async function (): Promise<void> {
  log('Action start');

  const packageJSONWithResources = await readPackageJSON(process.cwd());
  await validateNameAndResourceLength(packageJSONWithResources);

  log('Action end');
}
