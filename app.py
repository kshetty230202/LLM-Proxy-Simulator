import asyncio
import random
import time
from datetime import datetime
from typing import Dict, Any, Optional

import asyncpg
from quart import Quart, request, jsonify
from quart_cors import cors
from pydantic import BaseModel
import os
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

app = Quart(__name__)
app = cors(app, allow_origin="*")

# Configuration
DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://username:password@localhost:5432/llm_proxy")
MODEL_A_FAILURE_RATE = float(os.getenv("MODEL_A_FAILURE_RATE", "0.15"))
MODEL_A_MIN_LATENCY = int(os.getenv("MODEL_A_MIN_LATENCY", "200"))
MODEL_A_MAX_LATENCY = int(os.getenv("MODEL_A_MAX_LATENCY", "800"))

MODEL_B_FAILURE_RATE = float(os.getenv("MODEL_B_FAILURE_RATE", "0.05"))
MODEL_B_MIN_LATENCY = int(os.getenv("MODEL_B_MIN_LATENCY", "800"))
MODEL_B_MAX_LATENCY = int(os.getenv("MODEL_B_MAX_LATENCY", "2000"))

MAX_RETRIES = int(os.getenv("MAX_RETRIES", "3"))
RETRY_DELAY_MS = int(os.getenv("RETRY_DELAY_MS", "100"))

# Database connection pool
db_pool: Optional[asyncpg.Pool] = None

class InferenceRequest(BaseModel):
    prompt: str
    strategy: str = "fast"  # "fast" or "accurate"

class InferenceResponse(BaseModel):
    response: str
    model_used: str
    latency_ms: int
    retry_count: int
    status: str

async def init_db():
    """Initialize database connection and create tables"""
    global db_pool
    try:
        db_pool = await asyncpg.create_pool(DATABASE_URL)
        
        # Create inference_logs table
        async with db_pool.acquire() as conn:
            await conn.execute('''
                CREATE TABLE IF NOT EXISTS inference_logs (
                    id SERIAL PRIMARY KEY,
                    prompt TEXT NOT NULL,
                    response TEXT NOT NULL,
                    model_used VARCHAR(20) NOT NULL,
                    latency_ms INTEGER NOT NULL,
                    retry_count INTEGER DEFAULT 0,
                    status VARCHAR(20) NOT NULL,
                    strategy VARCHAR(20) NOT NULL,
                    fallback_status VARCHAR(50),
                    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            ''')
        print("Database initialized successfully")
    except Exception as e:
        print(f"Database initialization failed: {e}")
        # For demo purposes, continue without database
        db_pool = None

async def log_inference(log_data: Dict[str, Any]):
    """Log inference data to PostgreSQL"""
    if db_pool is None:
        print(f"Logging (no DB): {log_data}")
        return
    
    try:
        async with db_pool.acquire() as conn:
            await conn.execute('''
                INSERT INTO inference_logs 
                (prompt, response, model_used, latency_ms, retry_count, status, strategy, fallback_status)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
            ''', 
            log_data['prompt'], log_data['response'], log_data['model_used'],
            log_data['latency_ms'], log_data['retry_count'], log_data['status'],
            log_data['strategy'], log_data.get('fallback_status', 'initial_attempt'))
    except Exception as e:
        print(f"Failed to log inference: {e}")

async def simulate_model_a(prompt: str) -> Dict[str, Any]:
    """Simulate Model A: Fast but occasionally unreliable"""
    start_time = time.time()
    
    # Simulate latency
    latency = random.randint(MODEL_A_MIN_LATENCY, MODEL_A_MAX_LATENCY)
    await asyncio.sleep(latency / 1000)  # Convert to seconds
    
    # Simulate failure
    if random.random() < MODEL_A_FAILURE_RATE:
        raise Exception("Model A failed: Rate limit exceeded")
    
    # Generate simulated response
    responses = [
        f"Model A (Fast) response to: {prompt[:50]}...",
        f"Quick answer from Model A: {prompt[:30]}...",
        f"Fast response: {prompt[:40]}...",
        f"Model A processed: {prompt[:35]}...",
        f"Rapid reply: {prompt[:45]}..."
    ]
    
    actual_latency = int((time.time() - start_time) * 1000)
    
    return {
        "response": random.choice(responses),
        "latency_ms": actual_latency,
        "model": "model_a"
    }

async def simulate_model_b(prompt: str) -> Dict[str, Any]:
    """Simulate Model B: Slower but more reliable"""
    start_time = time.time()
    
    # Simulate latency
    latency = random.randint(MODEL_B_MIN_LATENCY, MODEL_B_MAX_LATENCY)
    await asyncio.sleep(latency / 1000)  # Convert to seconds
    
    # Simulate failure (lower rate)
    if random.random() < MODEL_B_FAILURE_RATE:
        raise Exception("Model B failed: Internal server error")
    
    # Generate simulated response
    responses = [
        f"Model B (Accurate) comprehensive response to: {prompt[:50]}...",
        f"Detailed answer from Model B: {prompt[:30]}...",
        f"Thorough analysis: {prompt[:40]}...",
        f"Model B processed with high accuracy: {prompt[:35]}...",
        f"Reliable response: {prompt[:45]}..."
    ]
    
    actual_latency = int((time.time() - start_time) * 1000)
    
    return {
        "response": random.choice(responses),
        "latency_ms": actual_latency,
        "model": "model_b"
    }

async def infer_with_retry(prompt: str, strategy: str) -> Dict[str, Any]:
    """Perform inference with retry logic and intelligent routing"""
    retry_count = 0
    last_error = None
    
    # Determine initial model based on strategy
    if strategy == "fast":
        models_to_try = ["model_a", "model_b"]
    else:  # accurate
        models_to_try = ["model_b", "model_a"]
    
    for attempt in range(MAX_RETRIES + 1):
        for model in models_to_try:
            try:
                if model == "model_a":
                    result = await simulate_model_a(prompt)
                else:
                    result = await simulate_model_b(prompt)
                
                return {
                    "response": result["response"],
                    "model_used": result["model"],
                    "latency_ms": result["latency_ms"],
                    "retry_count": retry_count,
                    "status": "success",
                    "fallback_status": "initial_attempt" if retry_count == 0 else f"retry_{retry_count}_with_{model}"
                }
                
            except Exception as e:
                last_error = str(e)
                retry_count += 1
                
                if retry_count <= MAX_RETRIES:
                    # Wait before retry
                    await asyncio.sleep(RETRY_DELAY_MS / 1000)
                    continue
                else:
                    break
    
    # All retries exhausted
    return {
        "response": f"All models failed after {MAX_RETRIES} retries. Last error: {last_error}",
        "model_used": "none",
        "latency_ms": 0,
        "retry_count": retry_count,
        "status": "failed",
        "fallback_status": "all_retries_exhausted"
    }

@app.route('/api/infer', methods=['POST'])
async def infer():
    """Main inference endpoint"""
    try:
        data = await request.get_json()
        request_data = InferenceRequest(**data)
        
        # Perform inference with retry logic
        result = await infer_with_retry(request_data.prompt, request_data.strategy)
        
        # Log the inference
        log_data = {
            "prompt": request_data.prompt,
            "response": result["response"],
            "model_used": result["model_used"],
            "latency_ms": result["latency_ms"],
            "retry_count": result["retry_count"],
            "status": result["status"],
            "strategy": request_data.strategy,
            "fallback_status": result.get("fallback_status", "initial_attempt")
        }
        
        await log_inference(log_data)
        
        return jsonify(result), 200
        
    except Exception as e:
        return jsonify({"error": str(e)}), 400

@app.route('/api/logs', methods=['GET'])
async def get_logs():
    """Retrieve inference logs"""
    if db_pool is None:
        return jsonify({"logs": [], "message": "Database not available"}), 200
    
    try:
        limit = request.args.get('limit', 50, type=int)
        
        async with db_pool.acquire() as conn:
            rows = await conn.fetch('''
                SELECT * FROM inference_logs 
                ORDER BY timestamp DESC 
                LIMIT $1
            ''', limit)
            
            logs = []
            for row in rows:
                logs.append({
                    "id": row['id'],
                    "prompt": row['prompt'],
                    "response": row['response'],
                    "model_used": row['model_used'],
                    "latency_ms": row['latency_ms'],
                    "retry_count": row['retry_count'],
                    "status": row['status'],
                    "strategy": row['strategy'],
                    "fallback_status": row['fallback_status'],
                    "timestamp": row['timestamp'].isoformat()
                })
            
            return jsonify({"logs": logs}), 200
            
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/api/metrics/latency', methods=['GET'])
async def get_latency_metrics():
    """Get latency metrics for visualization"""
    if db_pool is None:
        return jsonify({"metrics": {}, "message": "Database not available"}), 200
    
    try:
        async with db_pool.acquire() as conn:
            # Get average latency by model
            model_metrics = await conn.fetch('''
                SELECT 
                    model_used,
                    AVG(latency_ms) as avg_latency,
                    COUNT(*) as total_requests,
                    COUNT(CASE WHEN status = 'success' THEN 1 END) as successful_requests
                FROM inference_logs 
                WHERE timestamp >= NOW() - INTERVAL '1 hour'
                GROUP BY model_used
            ''')
            
            # Get latency over time (last 20 points)
            time_series = await conn.fetch('''
                SELECT 
                    DATE_TRUNC('minute', timestamp) as time_bucket,
                    AVG(latency_ms) as avg_latency,
                    COUNT(*) as request_count
                FROM inference_logs 
                WHERE timestamp >= NOW() - INTERVAL '1 hour'
                GROUP BY time_bucket
                ORDER BY time_bucket DESC
                LIMIT 20
            ''')
            
            metrics = {
                "models": {row['model_used']: {
                    "avg_latency": float(row['avg_latency']),
                    "total_requests": row['total_requests'],
                    "success_rate": row['successful_requests'] / row['total_requests'] if row['total_requests'] > 0 else 0
                } for row in model_metrics},
                "time_series": [{
                    "timestamp": row['time_bucket'].isoformat(),
                    "avg_latency": float(row['avg_latency']),
                    "request_count": row['request_count']
                } for row in time_series]
            }
            
            return jsonify({"metrics": metrics}), 200
            
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/api/health', methods=['GET'])
async def health_check():
    """Health check endpoint"""
    return jsonify({
        "status": "healthy",
        "timestamp": datetime.now().isoformat(),
        "database_connected": db_pool is not None
    }), 200

@app.before_serving
async def startup():
    """Initialize database on startup"""
    await init_db()

@app.after_serving
async def shutdown():
    """Clean up database connection"""
    global db_pool
    if db_pool:
        await db_pool.close()

if __name__ == '__main__':
    import uvicorn
    uvicorn.run(
        app,
        host=os.getenv("HOST", "0.0.0.0"),
        port=int(os.getenv("PORT", 8000))
    ) 