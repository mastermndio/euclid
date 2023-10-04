package main

import (
	"bytes"
	"fmt"
	"os"
	"strconv"
	"strings"

	"github.com/aws/aws-sdk-go/aws"
	"github.com/aws/aws-sdk-go/aws/session"
	"github.com/aws/aws-sdk-go/service/s3"
)

func main() {
	// Grab environment variables from task definition
	region := os.Getenv("REGION")
	bucket := os.Getenv("BUCKET")
	key := os.Getenv("KEY")
	num1, err := strconv.Atoi(os.Getenv("NUM1"))
	num2, _ := strconv.Atoi(os.Getenv("NUM2"))

	// Create AWS Session
	sess, err := session.NewSession(&aws.Config{
		Region: aws.String(region),
	})
	if err != nil {
		fmt.Println("Error creating session:", err)
		return
	}

	// Process key name and output
	outputKey := strings.Split(key, "/")[1]
	body := num1 + num2

	// Upload output to S3
	svc := s3.New(sess)
	_, err = svc.PutObject(&s3.PutObjectInput{
		Bucket: aws.String(bucket),
		Key:    aws.String("output/" + outputKey),
		Body:   bytes.NewReader([]byte(strconv.Itoa(body))),
	})
	if err != nil {
		fmt.Println("Error uploading file:", err)
		return
	}

	fmt.Println("File uploaded successfully!!!")
}
