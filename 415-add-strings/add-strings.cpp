class Solution {
public:
    string addStrings(string num1, string num2) {
        int i = num1.size() - 1, j = num2.size() - 1;
        int carry = 0;
        string res;

        while (i >= 0 || j >= 0 || carry) {
            int d1 = i >= 0 ? num1[i--] - '0' : 0;
            int d2 = j >= 0 ? num2[j--] - '0' : 0;
            int total = d1 + d2 + carry;
            res += char('0' + total % 10);
            carry = total / 10;
        }

        reverse(res.begin(), res.end());
        return res;
    }
};