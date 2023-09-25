# Service Installation

## Prerequisites
- [ ] Pulumi CLI(configured for your account)
- [ ] AWS CLI(configured for your account)
- [ ] NodeJS
- [ ] Docker

## Infrastructure
The infrastructure for this service is fully contained in the `./infra` directory. 

1. Install node dependencies
```bash
cd infra && npm install
```
2. Create & select Pulumi stack you want to deploy to.
```bash
pulumi stack init <your-stack> && pulumi stack select <your-stack>
```
3. Before we deploy we need to set 2 required parameters:

- [ ] `imageName` - This is the name of the image you want to use for the ecs processing container. You can set this to `mastermndio/euclid` to use the prebuilt image from this repository
- [ ] `region` - Sets the aws region you want the service deployed to
```bash
pulumi config set imageName <image>
pulumi config set region <region>
```
4. Execute Pulumi
```bash
pulumi up -y
```
You will recieve output similar to the following:
```bash
OUTPUT                 VALUE
    outputApiUrl           https://1oxwxuvm4h.execute-api.us-east-1.amazonaws.com/prod
    outputBucketName       euclidbucket-3dd74cc
    outputServiceEndpoint  https://1oxwxuvm4h.execute-api.us-east-1.amazonaws.com/prod/euclid"
```

The service is available at the `outputServiceEndpoint` and accepts a POST request with JSON body with the following structure:
```json
{ "a": <int>, "b": <int> }
```

An example full request using curl would look like this:
```bash
curl -X POST -H "Content-Type: application/json" -d '{ "a": 20, "b": 50 }' https://1oxwxuvm4h.execute-api.us-east-1.amazonaws.com/prod/euclid
```

## Processing Container
An image that contains the latest code for the euclid processing container is deployed to Docker hub so there is no need to build the application seperately. 

Should you need to update it, simply build it via docker, push to whatever image repository you are using, and update the `imageName` pulumi config option to match the image you built

```bash
cd app
docker build -t <image-name> .
docker push <image-name>
```