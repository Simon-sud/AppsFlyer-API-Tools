from typing import Any

class SimpleConnectionPool:
    def __init__(
        self,
        minconn: int,
        maxconn: int,
        *args: Any,
        **kwargs: Any,
    ) -> None: ...
    def getconn(self, key: Any = None) -> Any: ...
    def putconn(self, conn: Any, key: Any = None, close: bool = False) -> None: ...
