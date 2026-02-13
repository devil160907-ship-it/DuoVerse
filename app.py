import os
import sys
import uuid
import io
import base64
from datetime import datetime
from flask import Flask, render_template, request, jsonify, session, abort, url_for, send_from_directory, make_response
from flask_sqlalchemy import SQLAlchemy
from werkzeug.utils import secure_filename
from PIL import Image
import json
import qrcode
from qrcode.image.styledpil import StyledPilImage
from qrcode.image.styles.moduledrawers import RoundedModuleDrawer
from qrcode.image.styles.colormasks import RadialGradiantColorMask
import requests  # Added for YouTube API check

# ========== ENVIRONMENT DETECTION ==========
def get_environment():
    """Detect if running in production (PythonAnywhere) or development"""
    # Check for PythonAnywhere environment
    if 'PYTHONANYWHERE_DOMAIN' in os.environ:
        return 'production'
    
    # Check for common production indicators
    if os.environ.get('FLASK_ENV') == 'production' or os.environ.get('ENV') == 'production':
        return 'production'
    
    # Check if running on PythonAnywhere (alternative check)
    if os.path.exists('/home/duo01'):
        return 'production'
    
    # Default to development
    return 'development'

ENV = get_environment()
IS_PRODUCTION = ENV == 'production'
IS_DEVELOPMENT = ENV == 'development'

print(f"🚀 Running in {ENV.upper()} mode")

# ========== CONFIGURATION BASED ON ENVIRONMENT ==========
class Config:
    """Base configuration"""
    SECRET_KEY = os.environ.get('SECRET_KEY', 'duoverse-secret-key-change-in-production')
    SQLALCHEMY_TRACK_MODIFICATIONS = False
    UPLOAD_FOLDER = 'static/uploads'
    MAX_CONTENT_LENGTH = 16 * 1024 * 1024
    YOUTUBE_API_KEY = os.environ.get('YOUTUBE_API_KEY', 'AIzaSyCHPCJ_w-Qv6LVKulUB1NYfCvoJEYE4cQ4')
    QR_FOLDER = 'static/qrcodes'

class DevelopmentConfig(Config):
    """Development configuration"""
    DEBUG = True
    SQLALCHEMY_DATABASE_URI = 'sqlite:///database.db'
    SERVER_NAME = None
    PREFERRED_URL_SCHEME = 'http'

class ProductionConfig(Config):
    """Production configuration for PythonAnywhere"""
    DEBUG = False
    SQLALCHEMY_DATABASE_URI = 'mysql+mysqlconnector://duo01:your_database_password@duo01.mysql.pythonanywhere-services.com/duo01$duoverse'
    # For SQLite on PythonAnywhere (if you prefer)
    # SQLALCHEMY_DATABASE_URI = 'sqlite:////home/duo01/duoverse/database.db'
    
    # Production settings
    PREFERRED_URL_SCHEME = 'https'
    SESSION_COOKIE_SECURE = True
    SESSION_COOKIE_HTTPONLY = True
    SESSION_COOKIE_SAMESITE = 'Lax'
    REMEMBER_COOKIE_SECURE = True
    REMEMBER_COOKIE_HTTPONLY = True

# Select configuration based on environment
if IS_PRODUCTION:
    app_config = ProductionConfig
    print("📦 Using production configuration")
else:
    app_config = DevelopmentConfig
    print("🔧 Using development configuration")

app = Flask(__name__)
app.config.from_object(app_config)

# Override with environment variables if they exist
app.config['SECRET_KEY'] = os.environ.get('SECRET_KEY', app.config['SECRET_KEY'])
app.config['YOUTUBE_API_KEY'] = os.environ.get('YOUTUBE_API_KEY', app.config['YOUTUBE_API_KEY'])

# Database configuration with environment override
if IS_PRODUCTION and 'DATABASE_URL' in os.environ:
    app.config['SQLALCHEMY_DATABASE_URI'] = os.environ.get('DATABASE_URL')
elif IS_PRODUCTION and 'PYTHONANYWHERE_DOMAIN' in os.environ:
    # Default PythonAnywhere MySQL configuration
    username = os.environ.get('PYTHONANYWHERE_USER', 'duo01')
    password = os.environ.get('DB_PASSWORD', 'your_database_password')
    database_name = f"{username}$duoverse"
    app.config['SQLALCHEMY_DATABASE_URI'] = f'mysql+mysqlconnector://{username}:{password}@{username}.mysql.pythonanywhere-services.com/{database_name}'

db = SQLAlchemy(app)

# ========== YOUTUBE API HEALTH CHECK ==========
def check_youtube_api():
    """
    Check if YouTube API key is valid and working
    This function only logs to console, no output to browser
    """
    print("\n" + "="*60)
    print("🔍 YOUTUBE API HEALTH CHECK")
    print("="*60)
    
    api_key = app.config['YOUTUBE_API_KEY']
    
    # Don't log the full key for security, just first/last few chars
    if api_key:
        masked_key = api_key[:8] + "..." + api_key[-4:] if len(api_key) > 12 else "***"
        print(f"📋 API Key: {masked_key}")
    else:
        print("❌ No YouTube API Key configured")
        print("="*60 + "\n")
        return False
    
    # Test with a simple, safe video search (never gonna give you up - always available)
    test_url = "https://www.googleapis.com/youtube/v3/videos"
    params = {
        'part': 'snippet',
        'id': 'dQw4w9WgXcQ',  # Rick Astley - Never Gonna Give You Up (always available)
        'key': api_key
    }
    
    try:
        print("🔄 Testing API connection...")
        response = requests.get(test_url, params=params, timeout=10)
        
        if response.status_code == 200:
            data = response.json()
            if data.get('items'):
                video_title = data['items'][0]['snippet']['title']
                print(f"✅ YouTube API is WORKING!")
                print(f"   Test video: '{video_title[:50]}...'")
                print(f"   Status Code: {response.status_code}")
                print("="*60 + "\n")
                return True
            else:
                print("⚠️  YouTube API responded but no video found")
                print(f"   Status Code: {response.status_code}")
                print("="*60 + "\n")
                return False
        else:
            error_data = response.json()
            error_reason = error_data.get('error', {}).get('errors', [{}])[0].get('reason', 'Unknown')
            error_message = error_data.get('error', {}).get('message', 'Unknown error')
            
            print(f"❌ YouTube API ERROR!")
            print(f"   Status Code: {response.status_code}")
            print(f"   Reason: {error_reason}")
            print(f"   Message: {error_message}")
            
            if response.status_code == 403:
                print("   🔑 Possible issues:")
                print("      - API key is invalid or expired")
                print("      - YouTube Data API v3 is not enabled")
                print("      - API key restrictions are blocking the request")
                print("      - Quota exceeded")
            elif response.status_code == 400:
                print("   🔑 Possible issues:")
                print("      - Invalid API key format")
                print("      - Malformed request")
            
            print("="*60 + "\n")
            return False
            
    except requests.exceptions.ConnectionError:
        print("❌ NETWORK ERROR: Cannot connect to YouTube API")
        print("   Check your internet connection")
        print("="*60 + "\n")
        return False
    except requests.exceptions.Timeout:
        print("❌ TIMEOUT ERROR: YouTube API request timed out")
        print("   The service might be slow or unavailable")
        print("="*60 + "\n")
        return False
    except Exception as e:
        print(f"❌ UNEXPECTED ERROR: {str(e)}")
        print("="*60 + "\n")
        return False

def check_youtube_quota():
    """
    Check approximate quota usage (if possible)
    This is a best-effort check as YouTube doesn't provide quota info via API
    """
    api_key = app.config['YOUTUBE_API_KEY']
    if not api_key:
        return
    
    print("\n" + "="*60)
    print("📊 YOUTUBE API QUOTA INFORMATION")
    print("="*60)
    print("ℹ️  YouTube API has a daily quota of 10,000 units")
    print("   • Video search: 100 units per request")
    print("   • Video details: 1 unit per video")
    print("   • Playlist items: 1 unit per request")
    print("\n💡 To monitor actual usage:")
    print("   1. Go to https://console.cloud.google.com/")
    print("   2. Select your project")
    print("   3. Navigate to 'APIs & Services' → 'Dashboard'")
    print("   4. Click on 'YouTube Data API v3'")
    print("   5. View 'Quotas' tab for usage metrics")
    print("="*60 + "\n")

# ========== HARDCODED PASSWORD ==========
HARDCODED_PASSWORD = "16092008"

# Ensure directories exist
os.makedirs(app.config['UPLOAD_FOLDER'], exist_ok=True)
os.makedirs(app.config['QR_FOLDER'], exist_ok=True)

# ========== DATABASE MODELS ==========

class Meeting(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    room_id = db.Column(db.String(36), unique=True, nullable=False)
    title = db.Column(db.String(200), nullable=False)
    description = db.Column(db.Text, nullable=True)
    date = db.Column(db.String(20), nullable=False)
    time = db.Column(db.String(20), nullable=False)
    gallery_password = db.Column(db.String(50), nullable=False, default=HARDCODED_PASSWORD)
    is_active = db.Column(db.Boolean, default=True)
    qr_code_path = db.Column(db.String(500), nullable=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    
class Message(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    meeting_id = db.Column(db.Integer, db.ForeignKey('meeting.id'), nullable=False)
    sender = db.Column(db.String(100), nullable=False)
    message = db.Column(db.Text, nullable=False)
    is_image = db.Column(db.Boolean, default=False)
    timestamp = db.Column(db.DateTime, default=datetime.utcnow)

class JoinRequest(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    meeting_id = db.Column(db.Integer, db.ForeignKey('meeting.id'), nullable=False)
    requester = db.Column(db.String(100), nullable=False)
    status = db.Column(db.String(20), default='pending')
    timestamp = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

class GalleryImage(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    meeting_id = db.Column(db.Integer, db.ForeignKey('meeting.id'), nullable=False)
    image_path = db.Column(db.String(500), nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

class YouTubeSession(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    meeting_id = db.Column(db.Integer, db.ForeignKey('meeting.id'), nullable=False)
    video_id = db.Column(db.String(100), nullable=True)
    video_title = db.Column(db.String(200), nullable=True)
    is_playing = db.Column(db.Boolean, default=False)
    current_time = db.Column(db.Float, default=0)
    volume = db.Column(db.Integer, default=100)
    playlist = db.Column(db.Text, default='[]')
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

# Create tables
with app.app_context():
    try:
        db.create_all()
        print("✅ Database tables created/verified")
    except Exception as e:
        print(f"❌ Database error: {e}")
        if IS_PRODUCTION:
            print("⚠️  Production database connection failed. Check your database configuration.")

# Run YouTube API health check
with app.app_context():
    youtube_status = check_youtube_api()
    if youtube_status:
        check_youtube_quota()
    else:
        print("⚠️  YouTube API features will be unavailable")
        print("   The 'Watch Together' feature requires a valid YouTube API key")
        print("   To fix this:")
        print("   1. Go to https://console.cloud.google.com/")
        print("   2. Create a project or select existing")
        print("   3. Enable YouTube Data API v3")
        print("   4. Create an API key")
        print("   5. Update the YOUTUBE_API_KEY in your environment\n")

# ========== QR CODE GENERATION FUNCTIONS ==========

def generate_meeting_qr(room_id, meeting_title, meeting_date, meeting_time):
    """
    Generate a styled QR code for the meeting partner link
    Returns: dict with path and base64 data
    """
    try:
        # Create partner link - now points to join request page
        base_url = get_base_url()
        partner_link = f"{base_url}/join-request/{room_id}"
        
        # Create QR code instance
        qr = qrcode.QRCode(
            version=1,
            error_correction=qrcode.constants.ERROR_CORRECT_H,
            box_size=10,
            border=4,
        )
        
        # Add data
        qr.add_data(partner_link)
        qr.make(fit=True)
        
        # Create styled image
        qr_image = qr.make_image(
            image_factory=StyledPilImage,
            module_drawer=RoundedModuleDrawer(),
            color_mask=RadialGradiantColorMask(
                center_color=(77, 163, 255),
                edge_color=(110, 181, 255),
                center_radius=0.5
            ),
            back_color=(255, 255, 255, 255),
            fill_color=(77, 163, 255, 255)
        )
        
        # Convert to RGB if needed
        if qr_image.mode != 'RGB':
            qr_image = qr_image.convert('RGB')
        
        # Add DuoVerse branding as an overlay
        from PIL import ImageDraw, ImageFont
        
        # Create a larger image with branding area
        branded_image = Image.new('RGB', (qr_image.width + 40, qr_image.height + 70), 'white')
        branded_image.paste(qr_image, (20, 20))
        
        # Add text
        draw = ImageDraw.Draw(branded_image)
        
        # Add title
        try:
            font = ImageFont.truetype("arial.ttf", 20)
        except:
            font = ImageFont.load_default()
        
        draw.text((branded_image.width // 2, branded_image.height - 30), 
                 f"DuoVerse: {meeting_title[:20]}", 
                 fill=(77, 163, 255), 
                 font=font, 
                 anchor="ms")
        
        # Generate filename
        filename = f"qr_{room_id}_{datetime.now().strftime('%Y%m%d_%H%M%S')}.png"
        filepath = os.path.join(app.config['QR_FOLDER'], filename)
        
        # Save image
        branded_image.save(filepath, 'PNG', quality=95, optimize=True)
        
        # Also generate base64 for inline display
        buffered = io.BytesIO()
        branded_image.save(buffered, format="PNG")
        img_base64 = base64.b64encode(buffered.getvalue()).decode('utf-8')
        
        return {
            'success': True,
            'path': f"qrcodes/{filename}",
            'base64': img_base64,
            'url': partner_link
        }
        
    except Exception as e:
        print(f"QR Generation Error: {str(e)}")
        # Fallback to simple QR
        return generate_simple_qr(room_id, meeting_title)

def generate_simple_qr(room_id, meeting_title):
    """Fallback QR generator"""
    try:
        base_url = get_base_url()
        partner_link = f"{base_url}/join-request/{room_id}"
        
        qr = qrcode.QRCode(version=1, box_size=10, border=4)
        qr.add_data(partner_link)
        qr.make(fit=True)
        
        img = qr.make_image(fill_color="#4DA3FF", back_color="white")
        
        filename = f"qr_simple_{room_id}.png"
        filepath = os.path.join(app.config['QR_FOLDER'], filename)
        img.save(filepath)
        
        buffered = io.BytesIO()
        img.save(buffered, format="PNG")
        img_base64 = base64.b64encode(buffered.getvalue()).decode('utf-8')
        
        return {
            'success': True,
            'path': f"qrcodes/{filename}",
            'base64': img_base64,
            'url': partner_link
        }
        
    except Exception as e:
        print(f"Simple QR Generation Error: {str(e)}")
        return {
            'success': False,
            'error': str(e),
            'url': f"/join-request/{room_id}"
        }

def get_base_url():
    """Get the base URL based on environment"""
    if IS_PRODUCTION:
        # For PythonAnywhere production
        return "https://duo01.pythonanywhere.com"
    else:
        # For local development
        return request.host_url.rstrip('/') if request else "http://localhost:5000"

@app.route('/api/generate-qr/<room_id>')
def api_generate_qr(room_id):
    """API endpoint to generate QR code for a meeting"""
    meeting = Meeting.query.filter_by(room_id=room_id).first()
    if not meeting:
        return jsonify({'error': 'Meeting not found'}), 404
    
    qr_data = generate_meeting_qr(
        room_id=meeting.room_id,
        meeting_title=meeting.title,
        meeting_date=meeting.date,
        meeting_time=meeting.time
    )
    
    if qr_data['success']:
        # Save QR path to meeting
        meeting.qr_code_path = qr_data['path']
        db.session.commit()
        
        return jsonify({
            'success': True,
            'qr_path': url_for('static', filename=qr_data['path']),
            'qr_base64': qr_data['base64'],
            'qr_url': qr_data['url']
        })
    else:
        return jsonify({
            'success': False,
            'error': qr_data.get('error', 'QR generation failed'),
            'url': qr_data['url']
        }), 500

@app.route('/qr/<room_id>')
def view_qr(room_id):
    """View QR code page"""
    meeting = Meeting.query.filter_by(room_id=room_id).first()
    if not meeting:
        abort(404)
    
    return render_template('qr_view.html', 
                         meeting=meeting,
                         room_id=room_id,
                         is_production=IS_PRODUCTION,
                         base_url=get_base_url())

@app.route('/qr/download/<room_id>')
def download_qr(room_id):
    """Download QR code as PNG"""
    meeting = Meeting.query.filter_by(room_id=room_id).first()
    if not meeting:
        abort(404)
    
    # Generate fresh QR
    qr_data = generate_meeting_qr(
        room_id=meeting.room_id,
        meeting_title=meeting.title,
        meeting_date=meeting.date,
        meeting_time=meeting.time
    )
    
    if qr_data['success']:
        filepath = os.path.join(app.config['QR_FOLDER'], os.path.basename(qr_data['path']))
        
        response = make_response(send_from_directory(
            app.config['QR_FOLDER'],
            os.path.basename(qr_data['path']),
            as_attachment=True,
            download_name=f'DuoVerse_{meeting.title}_{meeting.room_id[:8]}.png'
        ))
        
        return response
    else:
        abort(500)

# ========== NEW ROUTE: Join Request Page ==========
@app.route('/join-request/<room_id>')
def join_request_page(room_id):
    """Dedicated page for partners to request to join the meeting"""
    meeting = Meeting.query.filter_by(room_id=room_id).first()
    if not meeting:
        abort(404)
    
    return render_template('join_request_form.html', 
                         meeting=meeting,
                         room_id=room_id,
                         is_production=IS_PRODUCTION)

# ========== MAIN ROUTES ==========

@app.route('/')
def intro():
    return render_template('intro.html', is_production=IS_PRODUCTION)

@app.route('/setup')
def setup():
    return render_template('setup.html', is_production=IS_PRODUCTION)

@app.route('/offline.html')
def offline():
    return render_template('offline.html', is_production=IS_PRODUCTION)

@app.route('/manifest.json')
def manifest():
    """Serve the web app manifest"""
    base_url = get_base_url()
    return {
        "name": "DuoVerse",
        "short_name": "DuoVerse",
        "description": "Virtual meeting space for couples",
        "start_url": "/",
        "display": "standalone",
        "theme_color": "#4DA3FF",
        "background_color": "#0A0F1E",
        "icons": [
            {
                "src": f"{base_url}/static/icons/icon-192.png",
                "sizes": "192x192",
                "type": "image/png",
                "purpose": "any maskable"
            },
            {
                "src": f"{base_url}/static/icons/icon-512.png",
                "sizes": "512x512",
                "type": "image/png",
                "purpose": "any maskable"
            }
        ]
    }

@app.route('/api/create-meeting', methods=['POST'])
def create_meeting():
    data = request.json
    room_id = str(uuid.uuid4())
    
    meeting = Meeting(
        room_id=room_id,
        title=data['title'],
        description=data.get('description', ''),
        date=data['date'],
        time=data['time'],
        gallery_password=HARDCODED_PASSWORD  # Always use hardcoded password
    )
    
    db.session.add(meeting)
    db.session.commit()
    
    # Generate QR code for the meeting
    qr_data = generate_meeting_qr(
        room_id=room_id,
        meeting_title=data['title'],
        meeting_date=data['date'],
        meeting_time=data['time']
    )
    
    if qr_data['success']:
        meeting.qr_code_path = qr_data['path']
        db.session.commit()
    
    return jsonify({
        'room_id': room_id,
        'qr_generated': qr_data['success'],
        'qr_path': url_for('static', filename=qr_data['path']) if qr_data['success'] else None
    })

@app.route('/meeting-links/<room_id>')
def meeting_links(room_id):
    """Dedicated page for displaying meeting links after creation"""
    meeting = Meeting.query.filter_by(room_id=room_id).first()
    if not meeting:
        abort(404)
    
    # Generate QR if not exists
    qr_base64 = None
    if meeting.qr_code_path:
        # Load existing QR
        try:
            filepath = os.path.join('static', meeting.qr_code_path)
            if os.path.exists(filepath):
                with open(filepath, 'rb') as f:
                    img_data = f.read()
                    qr_base64 = base64.b64encode(img_data).decode('utf-8')
        except:
            pass
    
    # If no QR or failed to load, generate new one
    if not qr_base64:
        qr_data = generate_meeting_qr(
            room_id=meeting.room_id,
            meeting_title=meeting.title,
            meeting_date=meeting.date,
            meeting_time=meeting.time
        )
        if qr_data['success']:
            qr_base64 = qr_data['base64']
            meeting.qr_code_path = qr_data['path']
            db.session.commit()
    
    # Generate partner link for template - now points to join request page
    base_url = get_base_url()
    partner_link = f"{base_url}/join-request/{room_id}"
    
    return render_template('link.html',
                         room_id=room_id,
                         meeting_title=meeting.title,
                         meeting_date=meeting.date,
                         meeting_time=meeting.time,
                         meeting_description=meeting.description,
                         gallery_password=HARDCODED_PASSWORD,  # Use hardcoded password
                         qr_base64=qr_base64,
                         qr_path=url_for('static', filename=meeting.qr_code_path) if meeting.qr_code_path else None,
                         partner_link=partner_link,
                         base_url=base_url,
                         is_production=IS_PRODUCTION)

@app.route('/meet/<room_id>')
def meet(room_id):
    meeting = Meeting.query.filter_by(room_id=room_id).first()
    if not meeting:
        abort(404)
    
    is_host = request.args.get('host', 'false').lower() == 'true'
    
    return render_template('meet.html', 
                         meeting=meeting, 
                         is_host=is_host, 
                         is_started=is_meeting_started(meeting),
                         room_id=room_id,
                         youtube_api_key=app.config['YOUTUBE_API_KEY'],
                         is_production=IS_PRODUCTION)

@app.route('/chat/<room_id>')
def chat(room_id):
    meeting = Meeting.query.filter_by(room_id=room_id).first()
    if not meeting:
        abort(404)
    return render_template('chat.html', meeting=meeting, room_id=room_id, is_production=IS_PRODUCTION)

@app.route('/capture/<room_id>')
def capture(room_id):
    meeting = Meeting.query.filter_by(room_id=room_id).first()
    if not meeting:
        abort(404)
    return render_template('capture.html', meeting=meeting, room_id=room_id, is_production=IS_PRODUCTION)

@app.route('/gallery/<room_id>')
def gallery(room_id):
    meeting = Meeting.query.filter_by(room_id=room_id).first()
    if not meeting:
        abort(404)
    return render_template('gallery.html', meeting=meeting, room_id=room_id, hardcoded_password=HARDCODED_PASSWORD, is_production=IS_PRODUCTION)

# ========== EXTENDED JOIN REQUESTS MANAGEMENT ==========

@app.route('/join-requests/<room_id>')
def join_requests_page(room_id):
    """Dedicated page for managing all join requests"""
    meeting = Meeting.query.filter_by(room_id=room_id).first()
    if not meeting:
        abort(404)
    
    # Only host can access this page
    is_host = request.args.get('host', 'false').lower() == 'true'
    if not is_host:
        abort(403)
    
    return render_template('join_requests.html', 
                         meeting=meeting,
                         room_id=room_id,
                         meeting_title=meeting.title,
                         meeting_date=meeting.date,
                         meeting_time=meeting.time,
                         meeting_description=meeting.description,
                         is_production=IS_PRODUCTION)

@app.route('/api/join-requests/all/<room_id>')
def get_all_join_requests(room_id):
    """Get all join requests (pending, accepted, rejected) for a meeting"""
    try:
        meeting = Meeting.query.filter_by(room_id=room_id).first()
        if not meeting:
            return jsonify({'error': 'Meeting not found'}), 404
        
        requests = JoinRequest.query.filter_by(
            meeting_id=meeting.id
        ).order_by(JoinRequest.timestamp.desc()).all()
        
        return jsonify({
            'success': True,
            'requests': [{
                'id': r.id,
                'requester': r.requester,
                'requester_short': r.requester[:8] + '...',
                'status': r.status,
                'timestamp': r.timestamp.isoformat(),
                'responded_at': r.updated_at.isoformat() if hasattr(r, 'updated_at') and r.updated_at != r.timestamp else None
            } for r in requests]
        })
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/join-requests/clear-rejected/<room_id>', methods=['POST'])
def clear_rejected_requests(room_id):
    """Clear all rejected join requests for a meeting"""
    try:
        meeting = Meeting.query.filter_by(room_id=room_id).first()
        if not meeting:
            return jsonify({'error': 'Meeting not found'}), 404
        
        JoinRequest.query.filter_by(
            meeting_id=meeting.id,
            status='rejected'
        ).delete()
        
        db.session.commit()
        
        return jsonify({'success': True})
        
    except Exception as e:
        db.session.rollback()
        return jsonify({'error': str(e)}), 500

@app.route('/api/join-requests/stats/<room_id>')
def get_join_request_stats(room_id):
    """Get statistics about join requests"""
    try:
        meeting = Meeting.query.filter_by(room_id=room_id).first()
        if not meeting:
            return jsonify({'error': 'Meeting not found'}), 404
        
        total = JoinRequest.query.filter_by(meeting_id=meeting.id).count()
        pending = JoinRequest.query.filter_by(meeting_id=meeting.id, status='pending').count()
        accepted = JoinRequest.query.filter_by(meeting_id=meeting.id, status='accepted').count()
        rejected = JoinRequest.query.filter_by(meeting_id=meeting.id, status='rejected').count()
        
        return jsonify({
            'success': True,
            'stats': {
                'total': total,
                'pending': pending,
                'accepted': accepted,
                'rejected': rejected
            }
        })
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/join-requests/batch-accept/<room_id>', methods=['POST'])
def batch_accept_requests(room_id):
    """Accept multiple join requests at once"""
    try:
        meeting = Meeting.query.filter_by(room_id=room_id).first()
        if not meeting:
            return jsonify({'error': 'Meeting not found'}), 404
        
        data = request.json
        request_ids = data.get('request_ids', [])
        
        if not request_ids:
            return jsonify({'error': 'No request IDs provided'}), 400
        
        JoinRequest.query.filter(
            JoinRequest.id.in_(request_ids),
            JoinRequest.meeting_id == meeting.id
        ).update({JoinRequest.status: 'accepted'}, synchronize_session=False)
        
        db.session.commit()
        
        return jsonify({'success': True, 'accepted_count': len(request_ids)})
        
    except Exception as e:
        db.session.rollback()
        return jsonify({'error': str(e)}), 500

@app.route('/api/join-requests/batch-reject/<room_id>', methods=['POST'])
def batch_reject_requests(room_id):
    """Reject multiple join requests at once"""
    try:
        meeting = Meeting.query.filter_by(room_id=room_id).first()
        if not meeting:
            return jsonify({'error': 'Meeting not found'}), 404
        
        data = request.json
        request_ids = data.get('request_ids', [])
        
        if not request_ids:
            return jsonify({'error': 'No request IDs provided'}), 400
        
        JoinRequest.query.filter(
            JoinRequest.id.in_(request_ids),
            JoinRequest.meeting_id == meeting.id
        ).update({JoinRequest.status: 'rejected'}, synchronize_session=False)
        
        db.session.commit()
        
        return jsonify({'success': True, 'rejected_count': len(request_ids)})
        
    except Exception as e:
        db.session.rollback()
        return jsonify({'error': str(e)}), 500

@app.route('/api/join-requests/export/<room_id>')
def export_join_requests(room_id):
    """Export join requests as CSV"""
    try:
        meeting = Meeting.query.filter_by(room_id=room_id).first()
        if not meeting:
            return jsonify({'error': 'Meeting not found'}), 404
        
        requests = JoinRequest.query.filter_by(
            meeting_id=meeting.id
        ).order_by(JoinRequest.timestamp.desc()).all()
        
        import csv
        from io import StringIO
        
        si = StringIO()
        cw = csv.writer(si)
        cw.writerow(['Request ID', 'Requester', 'Status', 'Requested At', 'Responded At'])
        
        for r in requests:
            cw.writerow([
                r.id,
                r.requester,
                r.status,
                r.timestamp.strftime('%Y-%m-%d %H:%M:%S'),
                r.updated_at.strftime('%Y-%m-%d %H:%M:%S') if r.updated_at else ''
            ])
        
        output = make_response(si.getvalue())
        output.headers["Content-Disposition"] = f"attachment; filename=join_requests_{room_id}_{datetime.now().strftime('%Y%m%d')}.csv"
        output.headers["Content-type"] = "text/csv"
        
        return output
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500

# ========== JOIN REQUEST API ROUTES ==========

@app.route('/api/join-request/<room_id>', methods=['POST'])
def create_join_request(room_id):
    """Create a new join request from a partner"""
    try:
        meeting = Meeting.query.filter_by(room_id=room_id).first()
        if not meeting:
            return jsonify({'error': 'Meeting not found'}), 404
        
        # Check if meeting is active and started
        if not meeting.is_active:
            return jsonify({'error': 'Meeting is not active'}), 400
        
        if not is_meeting_started(meeting):
            return jsonify({'error': 'Meeting has not started yet'}), 400
        
        requester_id = str(uuid.uuid4())
        
        join_request = JoinRequest(
            meeting_id=meeting.id,
            requester=requester_id,
            status='pending'
        )
        
        db.session.add(join_request)
        db.session.commit()
        
        return jsonify({
            'success': True,
            'request_id': join_request.id,
            'requester_id': requester_id
        }), 201
        
    except Exception as e:
        db.session.rollback()
        return jsonify({'error': str(e)}), 500

@app.route('/api/join-requests/<room_id>')
def get_join_requests(room_id):
    """Get pending join requests for a meeting"""
    try:
        meeting = Meeting.query.filter_by(room_id=room_id).first()
        if not meeting:
            return jsonify({'error': 'Meeting not found'}), 404
        
        requests = JoinRequest.query.filter_by(
            meeting_id=meeting.id, 
            status='pending'
        ).order_by(JoinRequest.timestamp.desc()).all()
        
        return jsonify([{
            'id': r.id,
            'requester': r.requester[:8] + '...',
            'timestamp': r.timestamp.isoformat()
        } for r in requests])
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/join-request/<int:request_id>/<action>', methods=['POST'])
def handle_join_request(request_id, action):
    """Accept or reject a join request"""
    try:
        join_request = JoinRequest.query.get(request_id)
        if not join_request:
            return jsonify({'error': 'Request not found'}), 404
        
        if action in ['accept', 'reject']:
            join_request.status = 'accepted' if action == 'accept' else 'rejected'
            join_request.updated_at = datetime.utcnow()
            db.session.commit()
            return jsonify({'success': True})
        
        return jsonify({'error': 'Invalid action'}), 400
        
    except Exception as e:
        db.session.rollback()
        return jsonify({'error': str(e)}), 500

@app.route('/api/join-request-status/<room_id>')
def get_join_request_status(room_id):
    """Check the status of a join request"""
    try:
        meeting = Meeting.query.filter_by(room_id=room_id).first()
        if not meeting:
            return jsonify({'error': 'Meeting not found'}), 404
        
        requester_id = request.args.get('requester_id')
        if not requester_id:
            return jsonify({'status': 'none'})
        
        join_request = JoinRequest.query.filter_by(
            meeting_id=meeting.id,
            requester=requester_id
        ).first()
        
        if join_request:
            return jsonify({
                'status': join_request.status,
                'request_id': join_request.id
            })
        
        return jsonify({'status': 'none'})
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/check-join-status/<room_id>')
def check_join_status(room_id):
    """Check if a requester has been accepted"""
    try:
        meeting = Meeting.query.filter_by(room_id=room_id).first()
        if not meeting:
            return jsonify({'error': 'Meeting not found'}), 404
        
        requester_id = request.args.get('requester_id')
        if not requester_id:
            return jsonify({'accepted': False})
        
        join_request = JoinRequest.query.filter_by(
            meeting_id=meeting.id,
            requester=requester_id
        ).first()
        
        return jsonify({
            'accepted': join_request is not None and join_request.status == 'accepted'
        })
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/clear-rejected-request/<room_id>', methods=['POST'])
def clear_rejected_request(room_id):
    """Clear a specific rejected request"""
    try:
        meeting = Meeting.query.filter_by(room_id=room_id).first()
        if not meeting:
            return jsonify({'error': 'Meeting not found'}), 404
        
        requester_id = request.json.get('requester_id')
        if not requester_id:
            return jsonify({'error': 'Requester ID required'}), 400
        
        join_request = JoinRequest.query.filter_by(
            meeting_id=meeting.id,
            requester=requester_id,
            status='rejected'
        ).first()
        
        if join_request:
            db.session.delete(join_request)
            db.session.commit()
        
        return jsonify({'success': True})
        
    except Exception as e:
        db.session.rollback()
        return jsonify({'error': str(e)}), 500

# ========== YOUTUBE WATCH TOGETHER API ROUTES ==========

@app.route('/api/youtube/session/<room_id>', methods=['GET'])
def get_youtube_session(room_id):
    """Get YouTube session state for a meeting"""
    try:
        meeting = Meeting.query.filter_by(room_id=room_id).first()
        if not meeting:
            return jsonify({'error': 'Meeting not found'}), 404
        
        session = YouTubeSession.query.filter_by(meeting_id=meeting.id).first()
        if not session:
            session = YouTubeSession(meeting_id=meeting.id)
            db.session.add(session)
            db.session.commit()
        
        return jsonify({
            'video_id': session.video_id,
            'video_title': session.video_title,
            'is_playing': session.is_playing,
            'current_time': session.current_time,
            'volume': session.volume,
            'playlist': json.loads(session.playlist) if session.playlist else []
        })
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/youtube/load', methods=['POST'])
def youtube_load_video():
    """Load a YouTube video"""
    try:
        data = request.json
        room_id = data.get('room_id')
        video_id = data.get('video_id')
        video_title = data.get('video_title', '')
        
        meeting = Meeting.query.filter_by(room_id=room_id).first()
        if not meeting:
            return jsonify({'error': 'Meeting not found'}), 404
        
        session = YouTubeSession.query.filter_by(meeting_id=meeting.id).first()
        if not session:
            session = YouTubeSession(meeting_id=meeting.id)
            db.session.add(session)
        
        session.video_id = video_id
        session.video_title = video_title
        session.is_playing = False
        session.current_time = 0
        db.session.commit()
        
        return jsonify({'success': True})
        
    except Exception as e:
        db.session.rollback()
        return jsonify({'error': str(e)}), 500

@app.route('/api/youtube/play', methods=['POST'])
def youtube_play():
    """Play/pause video"""
    try:
        data = request.json
        room_id = data.get('room_id')
        is_playing = data.get('is_playing')
        current_time = data.get('current_time', 0)
        
        meeting = Meeting.query.filter_by(room_id=room_id).first()
        if not meeting:
            return jsonify({'error': 'Meeting not found'}), 404
        
        session = YouTubeSession.query.filter_by(meeting_id=meeting.id).first()
        if session:
            session.is_playing = is_playing
            session.current_time = current_time
            db.session.commit()
        
        return jsonify({'success': True})
        
    except Exception as e:
        db.session.rollback()
        return jsonify({'error': str(e)}), 500

@app.route('/api/youtube/seek', methods=['POST'])
def youtube_seek():
    """Seek to specific time"""
    try:
        data = request.json
        room_id = data.get('room_id')
        current_time = data.get('current_time', 0)
        
        meeting = Meeting.query.filter_by(room_id=room_id).first()
        if not meeting:
            return jsonify({'error': 'Meeting not found'}), 404
        
        session = YouTubeSession.query.filter_by(meeting_id=meeting.id).first()
        if session:
            session.current_time = current_time
            db.session.commit()
        
        return jsonify({'success': True})
        
    except Exception as e:
        db.session.rollback()
        return jsonify({'error': str(e)}), 500

@app.route('/api/youtube/volume', methods=['POST'])
def youtube_volume():
    """Change volume"""
    try:
        data = request.json
        room_id = data.get('room_id')
        volume = data.get('volume', 100)
        
        meeting = Meeting.query.filter_by(room_id=room_id).first()
        if not meeting:
            return jsonify({'error': 'Meeting not found'}), 404
        
        session = YouTubeSession.query.filter_by(meeting_id=meeting.id).first()
        if session:
            session.volume = volume
            db.session.commit()
        
        return jsonify({'success': True})
        
    except Exception as e:
        db.session.rollback()
        return jsonify({'error': str(e)}), 500

@app.route('/api/youtube/add-to-playlist', methods=['POST'])
def youtube_add_to_playlist():
    """Add video to playlist"""
    try:
        data = request.json
        room_id = data.get('room_id')
        video_id = data.get('video_id')
        video_title = data.get('video_title', '')
        
        meeting = Meeting.query.filter_by(room_id=room_id).first()
        if not meeting:
            return jsonify({'error': 'Meeting not found'}), 404
        
        session = YouTubeSession.query.filter_by(meeting_id=meeting.id).first()
        if not session:
            session = YouTubeSession(meeting_id=meeting.id)
            db.session.add(session)
        
        playlist = json.loads(session.playlist) if session.playlist else []
        
        # Check if already in playlist
        if not any(v['id'] == video_id for v in playlist):
            playlist.append({
                'id': video_id,
                'title': video_title,
                'added_at': datetime.now().isoformat()
            })
            
            session.playlist = json.dumps(playlist)
            db.session.commit()
        
        return jsonify({'success': True, 'playlist': playlist})
        
    except Exception as e:
        db.session.rollback()
        return jsonify({'error': str(e)}), 500

@app.route('/api/youtube/remove-from-playlist', methods=['POST'])
def youtube_remove_from_playlist():
    """Remove video from playlist"""
    try:
        data = request.json
        room_id = data.get('room_id')
        video_id = data.get('video_id')
        
        meeting = Meeting.query.filter_by(room_id=room_id).first()
        if not meeting:
            return jsonify({'error': 'Meeting not found'}), 404
        
        session = YouTubeSession.query.filter_by(meeting_id=meeting.id).first()
        if session:
            playlist = json.loads(session.playlist) if session.playlist else []
            playlist = [v for v in playlist if v['id'] != video_id]
            session.playlist = json.dumps(playlist)
            db.session.commit()
        
        return jsonify({'success': True})
        
    except Exception as e:
        db.session.rollback()
        return jsonify({'error': str(e)}), 500

# ========== MESSAGES API ==========

@app.route('/api/messages/<room_id>')
def get_messages(room_id):
    meeting = Meeting.query.filter_by(room_id=room_id).first()
    if not meeting:
        return jsonify({'error': 'Meeting not found'}), 404
    
    since = request.args.get('since', 0, type=int)
    messages = Message.query.filter(
        Message.meeting_id == meeting.id,
        Message.id > since
    ).order_by(Message.timestamp.asc()).all()
    
    return jsonify([{
        'id': m.id,
        'sender': m.sender,
        'message': m.message,
        'is_image': m.is_image,
        'timestamp': m.timestamp.isoformat()
    } for m in messages])

@app.route('/api/send-message/<room_id>', methods=['POST'])
def send_message(room_id):
    meeting = Meeting.query.filter_by(room_id=room_id).first()
    if not meeting:
        return jsonify({'error': 'Meeting not found'}), 404
    
    data = request.json
    message = Message(
        meeting_id=meeting.id,
        sender=data.get('sender', 'User'),
        message=data['message'],
        is_image=data.get('is_image', False)
    )
    
    db.session.add(message)
    db.session.commit()
    
    return jsonify({'success': True, 'message_id': message.id})

# ========== GALLERY API ==========

@app.route('/api/upload-image/<room_id>', methods=['POST'])
def upload_image(room_id):
    meeting = Meeting.query.filter_by(room_id=room_id).first()
    if not meeting:
        return jsonify({'error': 'Meeting not found'}), 404
    
    if 'image' not in request.files:
        return jsonify({'error': 'No image provided'}), 400
    
    file = request.files['image']
    if file.filename == '':
        return jsonify({'error': 'No image selected'}), 400
    
    filename = secure_filename(f"{uuid.uuid4()}_{file.filename}")
    room_folder = os.path.join(app.config['UPLOAD_FOLDER'], room_id)
    os.makedirs(room_folder, exist_ok=True)
    
    filepath = os.path.join(room_folder, filename)
    file.save(filepath)
    
    try:
        img = Image.open(filepath)
        img.thumbnail((1200, 1200))
        img.save(filepath, optimize=True, quality=85)
    except:
        pass
    
    gallery_image = GalleryImage(
        meeting_id=meeting.id,
        image_path=f"uploads/{room_id}/{filename}"
    )
    
    db.session.add(gallery_image)
    db.session.commit()
    
    return jsonify({
        'success': True,
        'image_id': gallery_image.id,
        'image_path': url_for('static', filename=f"uploads/{room_id}/{filename}")
    })

@app.route('/api/gallery-images/<room_id>')
def get_gallery_images(room_id):
    meeting = Meeting.query.filter_by(room_id=room_id).first()
    if not meeting:
        return jsonify({'error': 'Meeting not found'}), 404
    
    password = request.args.get('password')
    if password != HARDCODED_PASSWORD:  # Use hardcoded password
        return jsonify({'error': 'Invalid password'}), 401
    
    images = GalleryImage.query.filter_by(meeting_id=meeting.id).order_by(GalleryImage.created_at.desc()).all()
    
    return jsonify([{
        'id': img.id,
        'path': url_for('static', filename=img.image_path),
        'created_at': img.created_at.isoformat()
    } for img in images])

@app.route('/api/delete-image/<int:image_id>', methods=['DELETE'])
def delete_image(image_id):
    image = GalleryImage.query.get(image_id)
    if not image:
        return jsonify({'error': 'Image not found'}), 404
    
    filepath = os.path.join('static', image.image_path)
    if os.path.exists(filepath):
        try:
            os.remove(filepath)
        except:
            pass
    
    db.session.delete(image)
    db.session.commit()
    
    return jsonify({'success': True})

# ========== MEETING MANAGEMENT ==========

@app.route('/api/end-meeting/<room_id>', methods=['POST'])
def end_meeting(room_id):
    meeting = Meeting.query.filter_by(room_id=room_id).first()
    if meeting:
        meeting.is_active = False
        db.session.commit()
    return jsonify({'success': True})

@app.route('/api/check-meeting-active/<room_id>')
def check_meeting_active(room_id):
    meeting = Meeting.query.filter_by(room_id=room_id).first()
    if not meeting:
        return jsonify({'error': 'Meeting not found'}), 404
    
    return jsonify({'is_active': meeting.is_active})

# ========== ERROR HANDLERS ==========

@app.errorhandler(404)
def page_not_found(e):
    return render_template('offline.html', is_production=IS_PRODUCTION), 404

@app.errorhandler(500)
def internal_server_error(e):
    return render_template('offline.html', is_production=IS_PRODUCTION), 500

# ========== CONTEXT PROCESSOR ==========

@app.context_processor
def utility_processor():
    return {
        'now': datetime.now(),
        'app_name': 'DuoVerse',
        'app_version': '1.0.0',
        'is_production': IS_PRODUCTION,
        'environment': ENV
    }

# ========== HELPER FUNCTIONS ==========

def is_meeting_started(meeting):
    try:
        meeting_datetime = datetime.strptime(f"{meeting.date} {meeting.time}", "%Y-%m-%d %H:%M")
        return datetime.now() >= meeting_datetime
    except:
        return False

# ========== PRODUCTION WSGI ENTRY POINT ==========
# For PythonAnywhere, this is the application object
application = app

if __name__ == '__main__':
    if IS_PRODUCTION:
        print("⚠️  Running in production mode with development server - this is not recommended!")
        print("   Use a production WSGI server like gunicorn instead.")
        port = int(os.environ.get('PORT', 5000))
        app.run(host='0.0.0.0', port=port)
    else:
        print(f"🚀 Starting development server on http://localhost:5000")
        app.run(debug=True, host='0.0.0.0', port=5000)