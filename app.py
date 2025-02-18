from flask import Flask, render_template, request, jsonify, send_from_directory
from twelvelabs import TwelveLabs
from qdrant_client import QdrantClient
from qdrant_client.models import VectorParams, Distance, PointStruct
import os
from werkzeug.utils import secure_filename
import tempfile
from dotenv import load_dotenv
import uuid


load_dotenv()

app = Flask(__name__)
app.config['UPLOAD_FOLDER'] = os.path.join(os.getcwd(), 'uploads')
app.config['MAX_CONTENT_LENGTH'] = 16 * 1024 * 1024 


TWELVE_LABS_API_KEY = os.getenv('TWELVE_LABS_API_KEY')
QDRANT_HOST = os.getenv('QDRANT_HOST')
QDRANT_API_KEY = os.getenv('QDRANT_API_KEY')

if not TWELVE_LABS_API_KEY:
    raise ValueError("TWELVE_LABS_API_KEY environment variable is not set.")
if not QDRANT_HOST or not QDRANT_API_KEY:
    raise ValueError("QDRANT_HOST and QDRANT_API_KEY environment variables must be set.")

QDRANT_HOST = QDRANT_HOST.split(':')[0] if ':' in QDRANT_HOST else QDRANT_HOST

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
ALLOWED_VIDEO_EXTENSIONS = {'mp4', 'avi', 'mov', 'wmv'}

def allowed_video_file(filename):
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_VIDEO_EXTENSIONS

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


@app.route('/image_search', methods=['POST'])
def image_search():
    if request.method == 'POST':
        print("Received image search request")
        
        if 'image' not in request.files:
            print("No image file in request")
            return jsonify({'error': 'No image file provided'}), 400
        
        image_file = request.files['image']
        if image_file.filename == '':
            print("Empty filename received")
            return jsonify({'error': 'No selected file'}), 400

        try:
            temp_dir = tempfile.mkdtemp()
            temp_path = os.path.join(temp_dir, secure_filename(image_file.filename))
            
            print(f"Saving image temporarily to: {temp_path}")
            image_file.save(temp_path)

            # Create embedding
            embedding_response = twelvelabs_client.embed.create(
                model_name="Marengo-retrieval-2.7",
                image_file=temp_path
            )

            if not embedding_response.image_embedding or not embedding_response.image_embedding.segments:
                raise ValueError("Failed to generate image embedding")

            vector = embedding_response.image_embedding.segments[0].embeddings_float
            print(f"Vector generated, length: {len(vector)}")

            search_results = qdrant_client.search(
                collection_name=COLLECTION_NAME,
                query_vector=vector,
                limit=6
            )

            print(f"Found {len(search_results)} matches")

            formatted_results = []
            for result in search_results:
                video_data = {
                    'score': float(result.score),
                    'video_id': result.payload.get('video_id'),
                    'original_filename': result.payload.get('original_filename', 'Unknown'),
                    'start_time': result.payload.get('start_offset_sec', 0),
                    'end_time': result.payload.get('end_offset_sec', 0),
                    'confidence': 'high' if float(result.score) > 0.7 else 'medium'
                }
                
                # Include the correct video URL based on storage type
                if result.payload.get('is_url', False):
                    video_data['video_url'] = result.payload.get('video_url')
                else:
                    video_data['video_url'] = f"/video/{result.payload.get('video_id')}"
                
                print(f"Processing result: {video_data}")
                formatted_results.append(video_data)

            return jsonify(formatted_results)

        except Exception as e:
            print(f"Error during image search: {str(e)}")
            return jsonify({'error': str(e)}), 500

        finally:
            try:
                if os.path.exists(temp_path):
                    os.remove(temp_path)
                if os.path.exists(temp_dir):
                    os.rmdir(temp_dir)
            except Exception as cleanup_error:
                print(f"Cleanup error: {str(cleanup_error)}")

    return jsonify({'error': 'Method not allowed'}), 405


@app.route('/upload_video', methods=['POST'])
def upload_video():
    print("Received video upload request")
    
    try:
        # Check if request contains video URL or file
        if 'video_url' in request.form:
            # Handle video URL upload
            video_url = request.form['video_url']
            print(f"Processing video URL: {video_url}")
            
            # Generate unique identifier for the video
            video_id = str(uuid.uuid4())
            
            # Create embedding task for URL
            task = twelvelabs_client.embed.task.create(
                model_name="Marengo-retrieval-2.7",
                video_url=video_url
            )
            
            print(f"Created task for URL: id={task.id}, status={task.status}")
            
            # Wait for task completion
            task.wait_for_done(sleep_interval=3)
            task_result = twelvelabs_client.embed.task.retrieve(task.id)
            
            if task_result.status != 'ready':
                raise ValueError(f"Task failed with status: {task_result.status}")
            
            # Store URL-based video information
            points = [
                PointStruct(
                    id=idx,
                    vector=v.embeddings_float,
                    payload={
                        'video_id': video_id,
                        'video_url': video_url,
                        'is_url': True,
                        'start_offset_sec': v.start_offset_sec,
                        'end_offset_sec': v.end_offset_sec,
                        'embedding_scope': v.embedding_scope,
                        'original_filename': video_url.split('/')[-1],
                        'confidence': 'high' if idx % 2 == 0 else 'medium'
                    }
                )
                for idx, v in enumerate(task_result.video_embedding.segments)
            ]
            
            success_message = {
                'message': 'Video URL processed successfully',
                'video_id': video_id,
                'video_url': video_url,
                'segments': len(points)
            }
            
        elif 'video' in request.files:
            # Handle direct file upload
            video_file = request.files['video']
            if video_file.filename == '':
                return jsonify({'error': 'No selected file'}), 400
            
            if not allowed_video_file(video_file.filename):
                return jsonify({'error': 'Invalid file type'}), 400
            
            # Generate unique filename
            filename = str(uuid.uuid4()) + '_' + secure_filename(video_file.filename)
            file_path = os.path.join(app.config['UPLOAD_FOLDER'], filename)
            
            try:
                # Save file
                video_file.save(file_path)
                print(f"File saved to: {file_path}")
                
                # Create embedding task for file
                task = twelvelabs_client.embed.task.create(
                    model_name="Marengo-retrieval-2.7",
                    video_file=file_path
                )
                
                print(f"Created task for file: id={task.id}, status={task.status}")
                
                # Wait for task completion
                task.wait_for_done(sleep_interval=3)
                task_result = twelvelabs_client.embed.task.retrieve(task.id)
                
                if task_result.status != 'ready':
                    raise ValueError(f"Task failed with status: {task_result.status}")
                
                # Store file-based video information
                points = [
                    PointStruct(
                        id=idx,
                        vector=v.embeddings_float,
                        payload={
                            'video_id': filename,
                            'is_url': False,
                            'file_path': file_path,
                            'start_offset_sec': v.start_offset_sec,
                            'end_offset_sec': v.end_offset_sec,
                            'embedding_scope': v.embedding_scope,
                            'original_filename': video_file.filename,
                            'confidence': 'high' if idx % 2 == 0 else 'medium'
                        }
                    )
                    for idx, v in enumerate(task_result.video_embedding.segments)
                ]
                
                success_message = {
                    'message': 'Video file processed successfully',
                    'video_id': filename,
                    'segments': len(points)
                }
                
            except Exception as file_error:
                if os.path.exists(file_path):
                    os.remove(file_path)
                raise file_error
                
        else:
            return jsonify({'error': 'No video URL or file provided'}), 400
        
        # Store embeddings in Qdrant
        qdrant_client.upsert(collection_name=COLLECTION_NAME, points=points)
        return jsonify(success_message)
        
    except Exception as e:
        print(f"Upload error: {str(e)}")
        return jsonify({'error': str(e)}), 500
    


@app.route('/video/<video_id>')
def serve_video(video_id):
    try:
        # Check if this is a URL-based video
        search_results = qdrant_client.search(
            collection_name=COLLECTION_NAME,
            query_filter={
                "must": [
                    {"key": "video_id", "match": {"value": video_id}}
                ]
            },
            limit=1
        )
        
        if not search_results:
            return jsonify({'error': 'Video not found'}), 404
            
        video_info = search_results[0].payload
        
        # If it's a URL-based video, redirect to the original URL
        if video_info.get('is_url', False):
            return redirect(video_info['video_url'])
            
        # Otherwise serve the local file
        return send_from_directory(app.config['UPLOAD_FOLDER'], video_id)
        
    except Exception as e:
        print(f"Error serving video: {str(e)}")
        return jsonify({'error': 'Video not found'}), 404

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
            video_data = {
                'score': float(result.score),
                'video_id': result.payload.get('video_id'),
                'original_filename': result.payload.get('original_filename', 'Unknown'),
                'start_time': result.payload.get('start_offset_sec', 0),
                'end_time': result.payload.get('end_offset_sec', 0),
                'confidence': 'high' if float(result.score) > 0.7 else 'medium'
            }
            
            # Check if this is a URL-based video
            if result.payload.get('is_url', False):
                video_data['video_url'] = result.payload.get('video_url')
            else:
                # For locally stored videos, use the video serving endpoint
                video_data['video_url'] = f"/video/{result.payload.get('video_id')}"
            
            formatted_results.append(video_data)

        return jsonify(formatted_results)

    except Exception as e:
        print(f"Search error: {str(e)}")
        return jsonify({'error': str(e)}), 500


if __name__ == '__main__':
    app.run(debug=True)