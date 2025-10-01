#!/bin/bash

# プロジェクトIDとリージョン
PROJECT_ID="online-review-gallery"
REGION="asia-northeast1"
SERVICE_NAME="processfiletask"
SERVICE_ACCOUNT="816131605069-compute@developer.gserviceaccount.com"

echo "=== Cloud Run Deployment with Docker ==="
echo "Project: $PROJECT_ID"
echo "Region: $REGION"
echo "Service: $SERVICE_NAME"
echo ""

# TypeScriptをビルド
echo "Step 1: Building TypeScript..."
npm run build
if [ $? -ne 0 ]; then
  echo "❌ Build failed!"
  exit 1
fi
echo "✅ Build successful"
echo ""

# Cloud Runにデプロイ（Dockerfileを使用）
echo "Step 2: Deploying to Cloud Run with Dockerfile..."
gcloud run deploy $SERVICE_NAME \
  --source . \
  --project=$PROJECT_ID \
  --region=$REGION \
  --platform=managed \
  --no-allow-unauthenticated \
  --memory=2Gi \
  --timeout=1800 \
  --min-instances=0 \
  --max-instances=20 \
  --cpu=1 \
  --service-account=$SERVICE_ACCOUNT \
  --set-env-vars="FUNCTION_TARGET=processFileTask,FIREBASE_CONFIG={\"projectId\":\"$PROJECT_ID\",\"storageBucket\":\"$PROJECT_ID.firebasestorage.app\"},GCLOUD_PROJECT=$PROJECT_ID"

if [ $? -ne 0 ]; then
  echo "❌ Deployment failed!"
  exit 1
fi

echo ""
echo "✅ Deployment complete!"
echo ""
echo "📝 Next steps:"
echo "1. Get the Cloud Run service URL:"
echo "   gcloud run services describe $SERVICE_NAME --region=$REGION --format='value(status.url)'"
echo ""
echo "2. Update importController.ts to use the new URL instead of:"
echo "   https://${REGION}-${PROJECT_ID}.cloudfunctions.net/processFileTask"
echo ""
echo "3. Deploy other functions with Firebase CLI:"
echo "   firebase deploy --only functions --except functions:processFileTask"
