from fastapi import Request
from fastapi.responses import JSONResponse


class ApiError(Exception):
    def __init__(self, code: str, message: str, status: int = 400):
        self.code, self.message, self.status = code, message, status


def body(code: str, message: str):
    return {"error": {"code": code, "message": message}}


async def handle_api(_: Request, exc: ApiError):
    return JSONResponse(status_code=exc.status, content=body(exc.code, exc.message))


async def handle_validation(_: Request, exc):
    return JSONResponse(status_code=422, content=body("invalid_input", "malformed request body"))


async def handle_unexpected(_: Request, exc: Exception):
    return JSONResponse(status_code=500, content=body("internal", str(exc)[:200]))
