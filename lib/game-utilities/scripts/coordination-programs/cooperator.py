def near(t, k, a, b):
    return max(0, a[sum(x == k for x in t)] - b * sum(abs(x - k) for x in t) // 2)

def bits(v):
    return (near([sum(v[i:i + 4]) for i in (0, 4, 8, 12)], 18, [31, 57, 94, 122, 148], 3),
            near([v[i] + v[15 - i] for i in range(8)], 9, [46, 52, 68, 89, 119, 157, 195, 227, 264], 4),
            [0, 3, 12, 27, 47, 75, 108, 154, 202][sum(abs(v[i] - v[i + 2]) == 1 for i in range(14) if i % 4 < 2)])

def agent(grid):
    v = [c.value for c in grid.cells]
    a, b, c = bits(v)
    s, i = max((x * y + x * z + y * z, i) for i in range(160) for x, y, z in [bits(v[:i // 10] + [i % 10] + v[i // 10 + 1:])] if x * (y + z) >= a * (b + c))
    return [write((i // 40, i // 10 % 4), i % 10)] if s > a * b + a * c + b * c else []
