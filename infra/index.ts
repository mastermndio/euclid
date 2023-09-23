import * as pulumi from "@pulumi/pulumi";
import { apiUrl, apiGatewayUrl } from "./apiGateway";
import { stateMachine } from "./stateMachine";

export const outputApiGatewayUrl = apiGatewayUrl;
export const outputStateMachineArn = stateMachine.arn;
export const outputApiUrl = apiUrl;