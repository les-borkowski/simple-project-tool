from app.db.database import engine


def test_engine_pings_pooled_connections_before_use():
    """A pooled connection Neon has closed must be replaced, not handed to a request."""
    assert engine.pool._pre_ping is True
