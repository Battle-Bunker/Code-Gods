def near(t, k, a, b, c):
    n = sum(x == k for x in t)
    return max(0, a + b * n * n // 8 + c * n - sum(abs(x - k) for x in t) * 3 // 2)

def bits(v):
    n = sum(abs(v[i] - v[i + 2]) == 1 for i in range(14) if i % 4 < 2)
    return (near([sum(v[i:i + 4]) for i in (0, 4, 8, 12)], 18, 31, 0, 29),
            near([v[i] + v[15 - i] for i in range(8)], 9, 46, 27, 0),
            3 * n * n)

def key(v):
    a, b, c = bits(v)
    return 2 * a - b - c

def agent(grid):
    v = [c.value for c in grid.cells]
    s, i = max((key(v[:i // 10] + [i % 10] + v[i // 10 + 1:]), i) for i in range(160))
    return [write((i // 40, i // 10 % 4), i % 10)] if s > key(v) else []
