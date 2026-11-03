"""password reset challenges

Revision ID: 0002_password_reset
Revises: 0001_baseline
Create Date: 2026-10-18

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "0002_password_reset"
down_revision: Union[str, Sequence[str], None] = "0001_baseline"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "password_reset_challenges",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("merchant_id", sa.Integer(), nullable=False),
        sa.Column("email", sa.String(length=160), nullable=False),
        sa.Column("code_hash", sa.String(length=255), nullable=False),
        sa.Column("token_hash", sa.String(length=64), nullable=True),
        sa.Column("expires_at", sa.DateTime(), nullable=False),
        sa.Column("attempts", sa.Integer(), nullable=False),
        sa.Column("verified_at", sa.DateTime(), nullable=True),
        sa.Column("consumed_at", sa.DateTime(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["merchant_id"], ["merchant_accounts.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    with op.batch_alter_table("password_reset_challenges", schema=None) as batch_op:
        batch_op.create_index(batch_op.f("ix_password_reset_challenges_email"), ["email"], unique=False)
        batch_op.create_index(batch_op.f("ix_password_reset_challenges_merchant_id"), ["merchant_id"], unique=False)
        batch_op.create_index(batch_op.f("ix_password_reset_challenges_token_hash"), ["token_hash"], unique=True)


def downgrade() -> None:
    with op.batch_alter_table("password_reset_challenges", schema=None) as batch_op:
        batch_op.drop_index(batch_op.f("ix_password_reset_challenges_token_hash"))
        batch_op.drop_index(batch_op.f("ix_password_reset_challenges_merchant_id"))
        batch_op.drop_index(batch_op.f("ix_password_reset_challenges_email"))
    op.drop_table("password_reset_challenges")
