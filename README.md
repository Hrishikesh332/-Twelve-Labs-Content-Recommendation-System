# Content Recommendation Engine

The Content Recommendation Engine is an AI-powered platform that enables intelligent content discovery through vector embeddings and multimodal search capabilities. 


The system allows users to search for video content using text queries or image, making content retrieval more intuitive and effective.



## Technical Components


### Backend Services

- **Upload Controller** - Handles video ingestion and processing.
- **Search Controller** - Processes search queries and retrieves relevant content.
- **Video Controller** - Manages video retrieval and streaming.


### Environment Variables
```bash
TWELVE_LABS_API_KEY=your_api_key
QDRANT_HOST=your_qdrant_host
QDRANT_API_KEY=your_qdrant_api_key
AWS_ACCESS_KEY=your_aws_access_key
AWS_SECRET_KEY=your_aws_secret_key
AWS_BUCKET_NAME=your_bucket_name
AWS_REGION=us-east-1
```

### Dependencies
- Python 3.9+
- Flask
- TwelveLabs SDK
- Qdrant Client
- Boto3 (AWS SDK)
- CORS middleware

## Installation and Setup

### Clone the repository
```bash
git clone https://github.com/Hrishikesh332/Content-Recommendation-System.git
cd content-recommendation-engine
```

### Install dependencies
```bash
pip install -r requirements.txt
```

### Set up environment variables
```bash
cp .env.example .env
# Edit .env with your configuration
```

### Run the application
```bash
python app.py
```
The application will be available at [http://localhost:5000](http://localhost:5000).

## API Endpoints
| Endpoint | Method | Description |
|----------|--------|-------------|
| `/upload_video` | POST | Upload video file or URL |
| `/search` | POST | Perform text-based search |
| `/image_search` | POST | Perform image-based search |
| `/video/{video_id}` | GET | Retrieve or stream video |
