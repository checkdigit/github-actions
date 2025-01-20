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
const SERVICE_NAME_LENGTH_EXCEPTIONS = new Set([
  'current-certification',
  'mngs-interchange-file',
  'teampay-card-management',
  'teampay-client-management',
  'teampay-merchant-terminal',
  'teampay-vendor-management',
]); // list of services with names that are longer than limit

const MAXIMUM_S3_BUCKET_NAME_LENGTH = 25;
const S3_BUCKET_NAME_LENGTH_EXCEPTIONS = new Set(['']); // list of resources with names that are longer than limit

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

  const serviceName = packageJSONWithResources.service.name;

  if (!SERVICE_NAME_LENGTH_EXCEPTIONS.has(serviceName) && serviceName.length > MAXIMUM_SERVICE_NAME_LENGTH) {
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
