class Solution {
public:
    string addBinary(string a, string b) {
        int i = a.size() - 1, j = b.size() - 1;
        int carry = 0;
        string res;

        while (i >= 0 || j >= 0 || carry) {
            int b1 = i >= 0 ? a[i--] - '0' : 0;
            int b2 = j >= 0 ? b[j--] - '0' : 0;
            int total = b1 + b2 + carry;
            res += char('0' + total % 2);
            carry = total / 2;
        }

        reverse(res.begin(), res.end());
        return res;
    }
};