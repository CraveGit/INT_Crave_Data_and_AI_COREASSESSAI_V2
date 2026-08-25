import os
from dotenv import load_dotenv
from sqlalchemy import create_engine

from modules.logsetup import getLogger

# load_dotenv is a no-op in CF (no .env shipped); real config comes from cf set-env.
# Kept for local dev convenience only.
load_dotenv()
logger = getLogger(__name__)

# LLM connectivity is AI Core via gen_ai_hub (see genai.py / helpers.py).
# Azure OpenAI client removed (was dead code).

#------------------------------------------- HANA database connectivity
host= os.getenv("HANA_HOST")
port= os.getenv("HANA_PORT")
user= os.getenv("HANA_USER")
password= os.getenv("HANA_PASS")
schema= os.getenv("SCHEMA")

def connectHANAdb():
    try:
        url = f"hana+hdbcli://{user}:{password}@{host}:{port}"
        engine = create_engine(url)
        print(f"Connected HANADB@{host}")
        return engine
    except Exception as e:
        logger.error(f"e0c20: {e}")
        return None