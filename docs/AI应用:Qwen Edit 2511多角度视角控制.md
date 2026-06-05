curl --location --request POST 'https://www.runninghub.ai/openapi/v2/run/ai-app/2062489144189865985' \
--header "Content-Type: application/json" \
--header "Authorization: Bearer ${RUNNINGHUB_API_KEY}" \
--data-raw '{
  "nodeInfoList": [
    {
      "nodeId": "13",
      "fieldName": "image",
      "fieldValue": "245aa8aab3e04c420031a2cbbd17c6f74243217dbdbb38508330e077afd2dc5a.png",
      "description": "image"
    },
    {
      "nodeId": "68",
      "fieldName": "value",
      "fieldValue": "<sks> right side view high-angle shot close-up",
      "description": "value"
    }
  ],
  "instanceType": "default",
  "usePersonalQueue": "false"
}'