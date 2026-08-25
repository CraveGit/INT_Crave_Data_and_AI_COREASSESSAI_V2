from typing import List, Optional
from pydantic import BaseModel, Field


DEFAULT_SKILLSET = "NodeJS"   # CAP on BTP; ABAP means RAP on the ABAP environment


class AnalyzeRequest(BaseModel):
    abap_object: str
    ObjectName: str = "_object"
    SkillSet: dict = Field(default_factory=lambda: {"Name": DEFAULT_SKILLSET})
    model: Optional[str] = None   # AI Core deployment name; overrides per-task defaults


class DocExportRequest(BaseModel):
    analysis: dict
    docType: str = "BBD"
    objectName: str = "object"
    CompanyName: str = "company"
    ProjectName: str = "project"
    prompt: str = ""
    model: Optional[str] = None


class ChatRequest(BaseModel):
    analysis: dict
    docType: str = "BBD"
    objectName: str = "object"
    CompanyName: str = "company"
    ProjectName: str = "project"
    user: str = "user"
    chat_prompt: str = ""
    history: List[dict] = Field(default_factory=list)   # stateless: prior turns from client
    model: Optional[str] = None
    # Deep-analysis mode: when true, extract an implementation-grade spec from the
    # ABAP `source` (validations, entities/fields, locking/LUW, messages...) and
    # ground the document on it. `deep_spec` is the cached extraction (skip re-run).
    deep: bool = False
    source: Optional[str] = None
    deep_spec: Optional[dict] = None
    # The document currently shown in the editor (HTML). On a refine request the model
    # edits THIS in place instead of regenerating from scratch (which lost content).
    current_doc: Optional[str] = None


class DocFromResponseRequest(BaseModel):
    analysis: dict
    docType: str = "BBD"
    objectName: str = "object"
    CompanyName: str = "company"
    ProjectName: str = "project"
    last_response: str
    model: Optional[str] = None


class EstimateServicesRequest(BaseModel):
    analysis: dict
    qna: list = []
    model: Optional[str] = None
