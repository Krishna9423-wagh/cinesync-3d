class Solution {
public:
    string largestNumber(vector<int>& cost, int target) {
        const int NEG = INT_MIN / 2;
        vector<int> dp(target + 1, NEG);
        dp[0] = 0;

        for (int t = 1; t <= target; t++) {
            for (int c : cost) {
                if (t >= c && dp[t - c] != NEG)
                    dp[t] = max(dp[t], dp[t - c] + 1);
            }
        }

        if (dp[target] < 0) return "0";

        string res;
        int t = target;
        while (t > 0) {
            for (int d = 9; d >= 1; d--) {
                int c = cost[d - 1];
                if (t >= c && dp[t - c] == dp[t] - 1) {
                    res += char('0' + d);
                    t -= c;
                    break;
                }
            }
        }
        return res;
    }
};