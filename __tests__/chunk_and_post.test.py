import json
import os
import sys
from pathlib import Path

import pytest
import unittest.mock as mock

# Import the script as a module
sys.path.append(str(Path(__file__).parent.parent))
import scripts.chunk_and_post as chunk

@pytest.fixture
def mock_env(monkeypatch):
    monkeypatch.setenv('KAGGLE_USERNAME', 'user')
    monkeypatch.setenv('KAGGLE_KEY', 'key')
    monkeypatch.setenv('BACKEND_API_KEY', 'token')
    monkeypatch.setenv('BACKEND_API_URL', 'http://localhost')

def test_post_chunks(mock_env):
    csv = "district_id,district_name,horizon,hazard_type,confidence,severity_score,target_date,prediction_date\n1,A,1,fire,0.9,5,2024-01-01,2024-01-01\n2,B,2,storm,0.8,4,2024-01-02,2024-01-02"
    with mock.patch('requests.post') as mock_post:
        mock_post.return_value.status_code = 200
        mock_post.return_value.json.return_value = {}
        chunk.main(csv.splitlines())
        mock_post.assert_called_once()