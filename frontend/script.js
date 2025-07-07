// Global state
let currentStrategy = 'fast';
let currentResponse = null;
let isLoading = false;
let logs = [];
let metrics = null;
let error = null;
let chart = null;

// API configuration
const API_BASE_URL = 'http://localhost:8000';

// DOM elements
const elements = {
    inferenceForm: null,
    prompt: null,
    submitBtn: null,
    errorMessage: null,
    responseSection: null,
    responseBox: null,
    responseDetails: null,
    metricsSection: null,
    metricsGrid: null,
    chartSection: null,
    logsContainer: null,
    strategyBtns: null,
    currentModel: null,
    currentLatency: null,
    charCount: null,
    tokenEstimate: null,
    quickActionBtns: null
};

// Initialize the application
document.addEventListener('DOMContentLoaded', function() {
    initializeElements();
    setupEventListeners();
    fetchLogs();
    fetchMetrics();
    
    // Set up periodic refresh
    setInterval(() => {
        fetchLogs();
        fetchMetrics();
    }, 5000); // Refresh every 5 seconds
});

function initializeElements() {
    elements.inferenceForm = document.getElementById('inferenceForm');
    elements.prompt = document.getElementById('prompt');
    elements.submitBtn = document.getElementById('submitBtn');
    elements.errorMessage = document.getElementById('errorMessage');
    elements.responseSection = document.getElementById('responseSection');
    elements.responseBox = document.getElementById('responseBox');
    elements.responseDetails = document.getElementById('responseDetails');
    elements.metricsSection = document.getElementById('metricsSection');
    elements.metricsGrid = document.getElementById('metricsGrid');
    elements.chartSection = document.getElementById('chartSection');
    elements.logsContainer = document.getElementById('logsContainer');
    elements.strategyBtns = document.querySelectorAll('.strategy-btn');
    elements.currentModel = document.getElementById('currentModel');
    elements.currentLatency = document.getElementById('currentLatency');
    elements.charCount = document.getElementById('charCount');
    elements.tokenEstimate = document.getElementById('tokenEstimate');
    elements.quickActionBtns = document.querySelectorAll('.quick-action-btn');
}

function setupEventListeners() {
    // Form submission
    elements.inferenceForm.addEventListener('submit', handleSubmit);
    
    // Strategy toggle buttons
    elements.strategyBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const strategy = btn.dataset.strategy;
            setStrategy(strategy);
        });
    });

    // Quick action buttons
    elements.quickActionBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const query = btn.dataset.query;
            elements.prompt.value = query;
            updateCharacterCount();
        });
    });

    // Character counting
    elements.prompt.addEventListener('input', updateCharacterCount);
}

function updateCharacterCount() {
    const text = elements.prompt.value;
    const charCount = text.length;
    
    elements.charCount.textContent = `Characters: ${charCount}`;
    
    if (charCount > 0) {
        const tokenEstimate = Math.ceil(charCount / 4);
        elements.tokenEstimate.textContent = `• Est. tokens: ~${tokenEstimate}`;
        elements.tokenEstimate.style.display = 'inline';
    } else {
        elements.tokenEstimate.style.display = 'none';
    }
}

function setStrategy(strategy) {
    currentStrategy = strategy;
    
    // Update button states
    elements.strategyBtns.forEach(btn => {
        btn.classList.remove('active');
        if (btn.dataset.strategy === strategy) {
            btn.classList.add('active');
        }
    });

    // Update model indicator
    if (strategy === 'fast') {
        elements.currentModel.textContent = 'Model A (Fast)';
        elements.currentLatency.textContent = '200-800ms';
        document.querySelector('.model-dot').style.background = '#f97316';
    } else {
        elements.currentModel.textContent = 'Model B (Accurate)';
        elements.currentLatency.textContent = '800-2000ms';
        document.querySelector('.model-dot').style.background = '#22c55e';
    }
}

async function handleSubmit(e) {
    e.preventDefault();
    const prompt = elements.prompt.value.trim();
    
    if (!prompt) return;

    setLoading(true);
    setError(null);
    setResponse(null);

    try {
        const response = await fetch(`${API_BASE_URL}/api/infer`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                prompt: prompt,
                strategy: currentStrategy
            })
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || 'Failed to get response from LLM');
        }

        const result = await response.json();
        setResponse(result);
        
        // Refresh logs and metrics after successful inference
        setTimeout(() => {
            fetchLogs();
            fetchMetrics();
        }, 1000);
        
    } catch (error) {
        setError(error.message);
    } finally {
        setLoading(false);
    }
}

function setLoading(loading) {
    isLoading = loading;
    
    if (loading) {
        elements.submitBtn.disabled = true;
        elements.submitBtn.innerHTML = '<span class="loading"></span> Processing...';
    } else {
        elements.submitBtn.disabled = false;
        elements.submitBtn.innerHTML = '<i class="fas fa-paper-plane"></i> Send Query';
    }
}

function setError(errorMessage) {
    error = errorMessage;
    
    if (errorMessage) {
        elements.errorMessage.innerHTML = `<i class="fas fa-exclamation-triangle"></i> Error: ${errorMessage}`;
        elements.errorMessage.style.display = 'flex';
    } else {
        elements.errorMessage.style.display = 'none';
    }
}

function setResponse(response) {
    currentResponse = response;
    
    if (response) {
        elements.responseBox.textContent = response.response;
        elements.responseDetails.innerHTML = `
            <strong>Model Used:</strong> ${response.model_used} | 
            <strong> Latency:</strong> ${response.latency_ms}ms | 
            <strong> Retries:</strong> ${response.retry_count} | 
            <strong> Status:</strong> ${response.status}
            ${response.fallback_status ? ` | <strong> Fallback:</strong> ${response.fallback_status}` : ''}
        `;
        elements.responseSection.style.display = 'block';
    } else {
        elements.responseSection.style.display = 'none';
    }
}

async function fetchLogs() {
    try {
        const response = await fetch(`${API_BASE_URL}/api/logs?limit=20`);
        if (response.ok) {
            const data = await response.json();
            logs = data.logs;
            renderLogs();
        }
    } catch (error) {
        console.error('Failed to fetch logs:', error);
    }
}

async function fetchMetrics() {
    try {
        const response = await fetch(`${API_BASE_URL}/api/metrics/latency`);
        if (response.ok) {
            const data = await response.json();
            metrics = data.metrics;
            renderMetrics();
            renderChart();
        }
    } catch (error) {
        console.error('Failed to fetch metrics:', error);
    }
}

function renderLogs() {
    if (logs.length === 0) {
        elements.logsContainer.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-inbox"></i>
                <p>No inference logs yet. Try sending a prompt!</p>
            </div>
        `;
        return;
    }

    const logsHTML = logs.map(log => `
        <div class="log-entry">
            <div>
                <span class="log-timestamp">${formatTimestamp(log.timestamp)}</span>
                {' | '}
                <span class="log-model">${log.model_used === 'model_a' ? 'Model A' : 'Model B'}</span>
                {' | '}
                <span class="${getStatusColor(log.status)}">${log.status.toUpperCase()}</span>
                ${log.retry_count > 0 ? `<span style="color: #f59e0b;">{' | '}Retries: ${log.retry_count}</span>` : ''}
            </div>
            <div style="margin-top: 4px; color: hsl(var(--muted-foreground));">
                <strong>Prompt:</strong> ${log.prompt.substring(0, 50)}${log.prompt.length > 50 ? '...' : ''}
            </div>
            <div style="margin-top: 2px; color: hsl(var(--muted-foreground));">
                <strong>Strategy:</strong> ${log.strategy} | 
                <strong> Latency:</strong> ${log.latency_ms}ms
            </div>
        </div>
    `).join('');

    elements.logsContainer.innerHTML = logsHTML;
}

function renderMetrics() {
    if (!metrics) {
        elements.chartSection.style.display = 'none';
        return;
    }

    elements.chartSection.style.display = 'block';
    
    const metricsHTML = Object.entries(metrics.models).map(([model, data], index) => {
        const icons = ['fas fa-chart-bar', 'fas fa-check-circle', 'fas fa-clock', 'fas fa-exclamation-triangle'];
        const colors = [
            'bg-gradient-to-br from-blue-500 to-blue-600',
            'bg-gradient-to-br from-green-500 to-green-600',
            'bg-gradient-to-br from-purple-500 to-purple-600',
            'bg-gradient-to-br from-orange-500 to-orange-600'
        ];
        const labels = ['Total Requests', 'Success Rate', 'Avg Latency', 'Error Count'];
        
        return `
            <div class="metric-card glass-card">
                <div class="metric-icon ${colors[index]}">
                    <i class="${icons[index]}"></i>
                </div>
                <div class="metric-content">
                    <h3>${labels[index]}</h3>
                    <div class="metric-value">${index === 1 ? `${(data.success_rate * 100).toFixed(1)}%` : index === 2 ? `${data.avg_latency.toFixed(0)}ms` : data.total_requests}</div>
                    <div class="metric-desc">${model === 'model_a' ? 'Model A (Fast)' : 'Model B (Accurate)'}</div>
                </div>
            </div>
        `;
    }).join('');

    elements.metricsGrid.innerHTML = metricsHTML;
}

function renderChart() {
    if (!metrics || !metrics.time_series || metrics.time_series.length === 0) {
        elements.chartSection.style.display = 'none';
        return;
    }

    elements.chartSection.style.display = 'block';

    const chartData = {
        labels: metrics.time_series.map(point => 
            new Date(point.timestamp).toLocaleTimeString()
        ).reverse(),
        datasets: [
            {
                label: 'Average Latency (ms)',
                data: metrics.time_series.map(point => point.avg_latency).reverse(),
                borderColor: '#22c55e',
                backgroundColor: 'rgba(34,197,94,0.15)',
                tension: 0.4,
                fill: true,
            },
        ],
    };

    const chartOptions = {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
            legend: {
                position: 'top',
                labels: {
                    color: 'hsl(var(--foreground))',
                    font: {
                        size: 12
                    }
                }
            },
            title: {
                display: true,
                text: 'Latency Over Time',
                color: 'hsl(var(--foreground))',
                font: {
                    size: 16,
                    weight: '600'
                }
            },
        },
        scales: {
            y: {
                beginAtZero: true,
                title: {
                    display: true,
                    text: 'Latency (ms)',
                    color: 'hsl(var(--muted-foreground))'
                },
                grid: {
                    color: 'hsl(var(--border))'
                },
                ticks: {
                    color: 'hsl(var(--muted-foreground))'
                }
            },
            x: {
                title: {
                    display: true,
                    text: 'Time',
                    color: 'hsl(var(--muted-foreground))'
                },
                grid: {
                    color: 'hsl(var(--border))'
                },
                ticks: {
                    color: 'hsl(var(--muted-foreground))'
                }
            },
        },
    };

    // Destroy existing chart if it exists
    if (chart) {
        chart.destroy();
    }

    const ctx = document.getElementById('latencyChart').getContext('2d');
    chart = new Chart(ctx, {
        type: 'line',
        data: chartData,
        options: chartOptions
    });
}

function getStatusColor(status) {
    switch (status) {
        case 'success':
            return 'log-status';
        case 'failed':
            return 'log-status failed';
        default:
            return 'log-status retry';
    }
}

function formatTimestamp(timestamp) {
    return new Date(timestamp).toLocaleTimeString();
} 