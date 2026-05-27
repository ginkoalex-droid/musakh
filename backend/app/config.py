from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    database_url: str = "postgresql+asyncpg://postgres:postgres@db:5432/garage_inventory"
    secret_key: str = "change-me-in-production-use-random-32-chars"
    algorithm: str = "HS256"
    access_token_expire_minutes: int = 60 * 24 * 7  # 7 days

    class Config:
        env_file = ".env"


settings = Settings()
