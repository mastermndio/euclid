import * as pulumi from "@pulumi/pulumi";
import { createApiGateway } from "./api-gateway/api-gateway";
import { createEcsTask } from "./ecs-task/ecs-task";
import { createStateMachine } from "./state-machine/state-machine"
import { createS3Bucket} from "./s3/s3"

const { euclidBucket } = createS3Bucket("euclidBucket");
const { cluster, s3BucketAccessPolicy, ecsRunTaskPolicy, ecsExecutionRole, ecsTaskRole, taskDefinition} = createEcsTask(euclidBucket);
const { stateMachine, sfnExecutionRole } = createStateMachine(s3BucketAccessPolicy, ecsRunTaskPolicy, ecsExecutionRole, euclidBucket, cluster, taskDefinition, ecsTaskRole);
const { apiStageDeployment } = createApiGateway(sfnExecutionRole, stateMachine);


export const outputApiUrl = apiStageDeployment.invokeUrl;
export const outputBucketName = euclidBucket.id;
export const outputServiceEndpoint = pulumi.interpolate`${outputApiUrl}/euclid`;
