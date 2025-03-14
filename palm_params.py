import numpy as np

def bisection(func, a, b, tol=1e-6, max_iter = 1000, iter = 0):
    c = (a+b)/2.
    fa, fb, fc = func(a), func(b), func(c)
    
    if iter == max_iter: return c
    if np.abs(fa) < tol: return a
    if np.abs(fb) < tol: return b
    if np.abs(fc) < tol: return c
    if np.abs(b-a) < tol: return c
    assert fa * fb < 0
    if fa * fc < 0: return bisection(func, a, c, tol=tol, max_iter = max_iter, iter = iter+1)
    else: return bisection(func, c, b, tol=tol, max_iter = max_iter, iter = iter+1)

def eff_price(theta, P, delta, K):
    return P / delta * (1 - (theta / delta) ** (K+1)) / (1 - (theta * delta) ** (K+1)) * (1 - theta * delta) / (1 - theta / delta)

def gov_reserves(L, theta, P, delta, K):
    return L * (1 - delta) * (1 - (theta * delta) ** (K+1)) / (1 - theta * delta) / np.sqrt(P)

def base_reserves(L, P, K, delta, theta):
    return L * np.sqrt(P) * (1- (theta * delta) ** K) * (1- delta)/ (1-theta*delta)


#--------- SET THESE PARAMS-----------------------------
# current price
sqrtP = 33773734510021576330964.0 * (10 ** 6) / 2 ** 96 
P = sqrtP * sqrtP

# BNB price
base_token_price = 1

# target eff price when price reached expected_move
target_eff = 0.22
expected_move = 0.24

# depletion price (at this price, all UNB will be sold)
depl_price = 0.26

# reserves 
GOV = 1079.745  
BASE = 20

# How large is the bucket
WINDOW_SIZE = 200

#----------PARAM CALC--------------#
K = np.round(np.log(expected_move / P / base_token_price) / np.log(1.0001) / WINDOW_SIZE)
delta = 1.0001 ** (-WINDOW_SIZE / 2.0)
theta = bisection(
    lambda t: eff_price(t, P, delta, K) * base_token_price - target_eff,
    1.0, 
    2.0
)

K_depl = np.round(np.log(depl_price / P / base_token_price) / np.log(1.0001) / WINDOW_SIZE)

L = GOV * sqrtP / (1 - delta) * (1 - theta * delta) / (1 - (theta * delta) ** (K_depl+1))
assert np.abs(GOV - gov_reserves(L, theta, P, delta, K_depl)) < 1e-6

if L * np.sqrt(P) * (1- delta)/ (1-1/theta*delta) >= BASE:
    K_down = np.round(bisection(
        lambda k: base_reserves(L, P, k, delta, 1/theta) - BASE,
        0,
        100000
    ))
else: K_down = np.infty

#----------------OUTPUT----------------#
print(f"n_buckets_eff={K}, n_buckets_depl={K_depl}, price={P}, price_usd={P * base_token_price}")
print(f"theta_upper = {theta}")
print(f"base_L = {L}")
print(f"support={(delta ** (2 * K_down) - 1)* 100:.2f}%")
print(f"Liquidity_min = {100/theta ** K_down:.2f}%")

#-------------------------DISTRIBUTIONS---------------------
from scipy.stats import norm
sigma = 0.50 
drift = 0.10

# approx K_50
K_50 = bisection(
    lambda k: gov_reserves(L, theta, P, delta, k) - GOV / 2.0,
    0, 
    K_depl
)

ratio = 1.0001 ** (WINDOW_SIZE * K_50)
def levy_cdf(t, T, S0, sigma):
    m = np.log(T/S0) / sigma
    return 2 * (1 - norm.cdf(m / np.sqrt(t)))
    
def levy_quantile(p, T, S0, sigma):
    m = np.log(T/S0) / sigma
    sqrtt = m / norm.ppf(1 - p/2)
    return sqrtt * sqrtt

print("Quantiles:")
for p in [0.5, 0.6, 0.7, 0.8, 0.9, 0.95]:
    print(p, levy_quantile(p, ratio, 1.0, sigma))

if drift > 0:
    m = np.log(ratio)
    print("Expectation:", m / drift, "Variance:", m * sigma * sigma / (drift ** 3))