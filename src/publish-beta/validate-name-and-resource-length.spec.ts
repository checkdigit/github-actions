// publish-beta/validate-name-and-resource-length.spec.ts

import { strict as assert } from 'node:assert';
import { describe, it } from '@jest/globals';

import { type PackageJSON, validateNameAndResourceLength } from './validate-name-and-resource-length';

describe('Test name and resource length', () => {
  it('No services property', async () => {
    const packageJSON: PackageJSON = {};
    await assert.doesNotReject(validateNameAndResourceLength(packageJSON));
  });

  it('No resources property', async () => {
    const packageJSON: PackageJSON = {
      service: {
        name: 'TestName',
      },
    };
    await assert.doesNotReject(validateNameAndResourceLength(packageJSON));
  });

  it('No aws resources property', async () => {
    const packageJSON: PackageJSON = {
      service: {
        name: 'TestName',
        resources: {},
      },
    };
    await assert.doesNotReject(validateNameAndResourceLength(packageJSON));
  });

  it('Empty aws resources property', async () => {
    const packageJSON: PackageJSON = {
      service: {
        name: 'TestName',
        resources: {
          aws: {},
        },
      },
    };
    await assert.doesNotReject(validateNameAndResourceLength(packageJSON));
  });

  it('Empty S3 resources property', async () => {
    const packageJSON: PackageJSON = {
      service: {
        name: 'TestName',
        resources: {
          aws: {
            s3: {},
          },
        },
      },
    };
    await assert.doesNotReject(validateNameAndResourceLength(packageJSON));
  });

  it('Name all within valid length', async () => {
    const packageJSON: PackageJSON = {
      service: {
        name: 'TestName',
        resources: {
          aws: {
            s3: {
              'valid-s3-name': {
                Type: 'AWS::S3::Bucket',
                Properties: {
                  BucketName: 'valid-s3-name',
                },
              },
            },
          },
        },
      },
    };
    await assert.doesNotReject(validateNameAndResourceLength(packageJSON));
  });

  it('Service name too long', async () => {
    const packageJSON: PackageJSON = {
      service: {
        name: 'TestNameThatIsTooLong1',
        resources: {
          aws: {
            s3: {
              'valid-s3-name': {
                Type: 'AWS::S3::Bucket',
                Properties: {
                  BucketName: 'valid-s3-name',
                },
              },
            },
          },
        },
      },
    };
    await assert.rejects(validateNameAndResourceLength(packageJSON));
  });

  it('Service name too long - exempt service', async () => {
    process.env['SERVICE_NAME_LENGTH_EXCEPTION'] = 'teampay-vendor-management';
    const packageJSON: PackageJSON = {
      service: {
        name: 'teampay-vendor-management',
        resources: {
          aws: {
            s3: {
              'valid-s3-name': {
                Type: 'AWS::S3::Bucket',
                Properties: {
                  BucketName: 'valid-s3-bucket-name',
                },
              },
            },
          },
        },
      },
    };
    await assert.doesNotReject(validateNameAndResourceLength(packageJSON));
  });

  it('S3 bucket name too long', async () => {
    const packageJSON: PackageJSON = {
      service: {
        name: 'TestName',
        resources: {
          aws: {
            s3: {
              bucket1: {
                Type: 'AWS::S3::Bucket',
                Properties: {
                  BucketName: 'valid name',
                },
              },
              bucket2: {
                Type: 'AWS::S3::Bucket',
                Properties: {
                  BucketName: 'invalid-bucket-length',
                },
              },
            },
          },
        },
      },
    };
    await assert.rejects(validateNameAndResourceLength(packageJSON));
  });

  it('S3 bucket name too long - exempt bucket', async () => {
    process.env['S3_BUCKET_NAME_LENGTH_EXCEPTIONS'] = 'ach.teampay.armor.inbound';
    const packageJSON: PackageJSON = {
      service: {
        name: 'TestName',
        resources: {
          aws: {
            s3: {
              bucket1: {
                Type: 'AWS::S3::Bucket',
                Properties: {
                  BucketName: 'valid name',
                },
              },
              'ach.teampay.armor.inbound': {
                Type: 'AWS::S3::Bucket',
                Properties: {
                  BucketName: 'ach.teampay.armor.inbound',
                },
              },
            },
          },
        },
      },
    };
    await assert.doesNotReject(validateNameAndResourceLength(packageJSON));
  });

  it('S3 bucket name too long - multiple exempt bucket', async () => {
    process.env['S3_BUCKET_NAME_LENGTH_EXCEPTIONS'] = 'mastercard.armor.inbound,ach.teampay.armor.inbound';
    const packageJSON: PackageJSON = {
      service: {
        name: 'TestName',
        resources: {
          aws: {
            s3: {
              bucket1: {
                Type: 'AWS::S3::Bucket',
                Properties: {
                  BucketName: 'valid name',
                },
              },
              'ach.teampay.armor.inbound': {
                Type: 'AWS::S3::Bucket',
                Properties: {
                  BucketName: 'ach.teampay.armor.inbound',
                },
              },
              'mastercard.armor.inbound': {
                Type: 'AWS::S3::Bucket',
                Properties: {
                  BucketName: 'mastercard.armor.inbound',
                },
              },
            },
          },
        },
      },
    };
    await assert.doesNotReject(validateNameAndResourceLength(packageJSON));
  });
});
