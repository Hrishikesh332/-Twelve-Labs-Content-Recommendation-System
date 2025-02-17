from flask import Flask, render_template, request, jsonify
from twelvelabs import TwelveLabs
from qdrant_client import QdrantClient
from qdrant_client.models import VectorParams, Distance, PointStruct
import os
from werkzeug.utils import secure_filename
import tempfile
from dotenv import load_dotenv


load_dotenv()

app = Flask(__name__)
app.config['UPLOAD_FOLDER'] = os.path.join(os.getcwd(), 'uploads')
app.config['MAX_CONTENT_LENGTH'] = 16 * 1024 * 1024  

# Initialize environment variables
TWELVE_LABS_API_KEY = os.getenv('TWELVE_LABS_API_KEY')
QDRANT_HOST = os.getenv('QDRANT_HOST')
QDRANT_API_KEY = os.getenv('QDRANT_API_KEY')

if not TWELVE_LABS_API_KEY:
    raise ValueError("TWELVE_LABS_API_KEY environment variable is not set.")
if not QDRANT_HOST or not QDRANT_API_KEY:
    raise ValueError("QDRANT_HOST and QDRANT_API_KEY environment variables must be set.")

QDRANT_HOST = QDRANT_HOST.split(':')[0] if ':' in QDRANT_HOST else QDRANT_HOST

# Initialize clients
twelvelabs_client = TwelveLabs(api_key=TWELVE_LABS_API_KEY)
qdrant_client = QdrantClient(
    url=f"https://{QDRANT_HOST}",
    api_key=QDRANT_API_KEY,
    timeout=20,
    prefer_grpc=False
)


os.makedirs(app.config['UPLOAD_FOLDER'], exist_ok=True)

COLLECTION_NAME = "content_collection"
VECTOR_SIZE = 1024

def init_qdrant():
    print("Initializing Qdrant collection...")
    try:
        collections = qdrant_client.get_collections().collections
        collection_exists = any(col.name == COLLECTION_NAME for col in collections)

        if not collection_exists:
            print(f"Creating new collection: {COLLECTION_NAME}")
            qdrant_client.recreate_collection(
                collection_name=COLLECTION_NAME,
                vectors_config=VectorParams(
                    size=VECTOR_SIZE,
                    distance=Distance.COSINE
                )
            )
            print(f"Successfully created collection: {COLLECTION_NAME}")
        else:
            print(f"Collection {COLLECTION_NAME} already exists")
            
    except Exception as e:
        print(f"Error during Qdrant initialization: {str(e)}")
        raise

try:
    init_qdrant()
except Exception as e:
    print(f"Failed to initialize Qdrant: {str(e)}")
    raise

@app.route('/')
def index():
    return render_template('index.html')
@app.route('/upload_video', methods=['POST'])
def upload_video():
    if 'video' not in request.files:
        return jsonify({'error': 'No video file provided'}), 400
    
    video_file = request.files['video']
    if video_file.filename == '':
        return jsonify({'error': 'No selected file'}), 400

    try:
        temp_path = os.path.join(app.config['UPLOAD_FOLDER'], secure_filename(video_file.filename))
        video_file.save(temp_path)
        
        print(f"File saved to: {temp_path}") 

        task = twelvelabs_client.embed.task.create(
            model_name="Marengo-retrieval-2.7",
            video_file=temp_path
        )
        
        print(f"Task created: {task.id}")  
        
        task.wait_for_done(sleep_interval=3)
        task_result = twelvelabs_client.embed.task.retrieve(task.id)
        
        print(f"Task completed: {task_result.status}")  

        points = [
            PointStruct(
                id=idx,
                vector=v.embeddings_float,
                payload={
                    "start_offset_sec": v.start_offset_sec,
                    "end_offset_sec": v.end_offset_sec,
                    "embedding_scope": v.embedding_scope,
                    "filename": video_file.filename,
                    "confidence": "high" if idx % 2 == 0 else "medium"  
                }
            )
            for idx, v in enumerate(task_result.video_embedding.segments)
        ]

        qdrant_client.upsert(collection_name=COLLECTION_NAME, points=points)

        return jsonify({
            'message': 'Video processed successfully',
            'segments': len(points)
        })

    except Exception as e:
        print(f"Upload error: {str(e)}") 
        return jsonify({'error': str(e)}), 500
    
    finally:
        # Clean up the temporary file
        if os.path.exists(temp_path):
            os.remove(temp_path)

            
@app.route('/search', methods=['POST'])
def search():
    try:
        data = request.get_json()
        if not data or 'query' not in data:
            return jsonify({'error': 'No query provided'}), 400

        # Create text embedding
        embedding_response = twelvelabs_client.embed.create(
            model_name="Marengo-retrieval-2.7",
            text=data['query']
        )
        
        if not embedding_response or not embedding_response.text_embedding or not embedding_response.text_embedding.segments:
            return jsonify({'error': 'Failed to generate text embedding'}), 500

        # Get embedding vector
        vector = embedding_response.text_embedding.segments[0].embeddings_float

        # Search in Qdrant
        search_results = qdrant_client.search(
            collection_name=COLLECTION_NAME,
            query_vector=vector,
            limit=6
        )

        formatted_results = []
        for result in search_results:
            formatted_results.append({
                'score': float(result.score),  
                'filename': result.payload.get('filename', 'Unknown'),
                'start_time': result.payload.get('start_offset_sec', 0),
                'end_time': result.payload.get('end_offset_sec', 0),
                'confidence': 'high' if float(result.score) > 0.7 else 'medium'
            })

        return jsonify(formatted_results)

    except Exception as e:
        print(f"Search error: {str(e)}")
        return jsonify({'error': str(e)}), 500
    
if __name__ == '__main__':
    app.run(debug=True)