package main

import (
	"bytes"
	"fmt"
	"log"
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
	if err != nil {
		log.Panicf("You provided %v as input for 'a'. Please provide a valid integer", num1)
	}

	num2, err := strconv.Atoi(os.Getenv("NUM2"))
	if err != nil {
		log.Panicf("You provided %v as input for 'b'. Please provide a valid integer", num2)
	}

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
