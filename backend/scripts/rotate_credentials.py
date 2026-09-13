"""Re-encrypt every stored LLM credential under the current primary encryption key.

Step 2 of a CREDENTIAL_ENCRYPTION_KEY rotation:

    1. Prepend the new key, keeping the old one:
           CREDENTIAL_ENCRYPTION_KEY=<new>,<old>
    2. uv run python -m scripts.rotate_credentials
    3. Drop the old key from the list.

Skipping this leaves rows readable only by the retired key. Dropping that key then makes
them undecryptable — and the capture path treats an undecryptable credential as "no
credential", falling back to the server's provider key. So the whole user base would
quietly start spending the operator's quota, with no error anywhere.

Idempotent: re-encrypting a value already under the primary key is a no-op in effect.
Never prints or returns a plaintext key — MultiFernet.rotate decrypts and re-encrypts in
one step.
"""

import argparse
import asyncio
import sys

from sqlalchemy import select

from app.core.crypto import CredentialEncryptionUnavailable, rotate_secret
from app.db.database import AsyncSessionLocal
from app.db.models import UserLLMProvider


async def rotate_all(db, *, dry_run: bool) -> tuple[int, int]:
    """Returns (rotated, failed)."""
    rows = (await db.scalars(select(UserLLMProvider))).all()
    rotated = 0
    failed = 0

    for row in rows:
        try:
            new_ciphertext = rotate_secret(row.api_key_encrypted)
        except CredentialEncryptionUnavailable as exc:
            # Readable by no configured key: the writing key is already gone. Report it
            # rather than aborting, so one unrecoverable row cannot block the rest.
            failed += 1
            print(
                f"  FAILED user={row.user_id} provider={row.provider}: {exc}",
                file=sys.stderr,
            )
            continue

        if not dry_run:
            row.api_key_encrypted = new_ciphertext
        rotated += 1

    if not dry_run:
        await db.commit()

    return rotated, failed


async def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Report what would be re-encrypted without writing anything.",
    )
    args = parser.parse_args()

    async with AsyncSessionLocal() as db:
        rotated, failed = await rotate_all(db, dry_run=args.dry_run)

    verb = "would re-encrypt" if args.dry_run else "re-encrypted"
    print(f"{verb} {rotated} credential(s)")

    if failed:
        print(
            f"{failed} credential(s) could not be read by any configured key. Add the "
            "key that wrote them back to CREDENTIAL_ENCRYPTION_KEY and re-run, or those "
            "users must re-enter their provider key.",
            file=sys.stderr,
        )
        sys.exit(1)


if __name__ == "__main__":
    asyncio.run(main())
