/**
 * Gateway CA certificate, embedded as a module.
 *
 * Runtime file reads are unreliable on serverless platforms: the bundle is
 * laid out under the build output while `process.cwd()` may point elsewhere,
 * so `certs/gowa-ca.pem` can be absent even when it is traced. Embedding the
 * PEM removes the filesystem dependency entirely.
 *
 * This is a certificate only — no private key — so it is safe to commit.
 *
 * WARNING: the gateway uses a self-signed certificate. If it is regenerated,
 * TLS pinning breaks and this constant must be refreshed. Refresh with:
 *   openssl s_client -connect <gateway-host>:443 </dev/null 2>/dev/null \
 *     | openssl x509 -outform PEM > certs/gowa-ca.pem
 * and re-run the generator that produced this file.
 *
 * Precedence is handled in lib/gowa-tls.ts: GOWA_CA_CERT, then GOWA_CA_FILE,
 * then this constant. Set GOWA_CA_CERT to rotate without a code change.
 *
 * Fingerprint (sha256): 42:79:B8:89:9C:D3:F9:5D:0D:A3:D6:FB:85:28:94:63:E4:FE:C3:49:96:04:C1:00:DB:F8:52:79:D8:8D:95:4E
 */
export const GOWA_CA_CERT = `
-----BEGIN CERTIFICATE-----
MIIDnjCCAoagAwIBAgIULErh1JewjpsSyFk3fSXGC+HYBfMwDQYJKoZIhvcNAQEL
BQAwVjELMAkGA1UEBhMCSUQxEjAQBgNVBAgMCUluZG9uZXNpYTEPMA0GA1UEBwwG
TWFuYWRvMQowCAYDVQQKDAEgMRYwFAYDVQQDDA0xMDcuMjMuMTI4LjkzMB4XDTI2
MDkzMDA5MjUwOFoXDTI3MDkzMDA5MjUwOFowVjELMAkGA1UEBhMCSUQxEjAQBgNV
BAgMCUluZG9uZXNpYTEPMA0GA1UEBwwGTWFuYWRvMQowCAYDVQQKDAEgMRYwFAYD
VQQDDA0xMDcuMjMuMTI4LjkzMIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKC
AQEAo4Jo+ofXHqp8gUA7Q4gAkpV7yDKjnHaCJdSPWUQ2cD1FHcrKepElTweGPFm8
xBI0t9MRccJFf90j3QHgGAs/HXoGq+kdK6fPiHeCMp1/Dt1Kjz2oXz8WRHrsOu4h
a6JTNoMHfay6A9arGUz7dRs9D+qIPaeZCSOuyXLaeLDdO6f0m4paITX1341cChND
5ozXXhCrC7JDC1idBoyNL4YXzRB6GFX5xu2d1DzITLHlBK59ueaf6id+6VzkNflH
ywJ5SkxiUTvzTo4joOuiD0ZZ+enq0L9JLK7Fz7jXJPcDsE+YxZgM5SnuZvSftMHG
/hkxXr6G5ax3kd4/U8VHUGUZDQIDAQABo2QwYjAdBgNVHQ4EFgQU+23PMbz6Jj7t
ZPXLD1/Eay1b6m0wHwYDVR0jBBgwFoAU+23PMbz6Jj7tZPXLD1/Eay1b6m0wDwYD
VR0TAQH/BAUwAwEB/zAPBgNVHREECDAGhwRrF4BdMA0GCSqGSIb3DQEBCwUAA4IB
AQAMj4QQ128G0b9fQUzIjFvFq5ZC9QEJKDnzi32ekzbjnpI3fZ13rXwyTYN2Ta8d
t2W0W57IBf/5Qm3+jZLAaU/kz8VQjjh8kH2jK0A9AahnFOfvHAr3A9wpsBXcXs60
m0QkqTBRoYIv4fBNZ/qV0VPb0gHM+NOC79j7Mxlg1DbmT45WXMwC893DAOOdlLnk
2ekReB+nKjw2TROiBmv/j0DCJR+ORprcaVFej4iyhg8R1zp0pIivIZnvSNILWsWt
Y5HA6rknaYOdoVuaZKO8Ogpa4SHMLa2+53N8hgYAkkpKCpA0wekJBoUDGHyE7Sx1
GlURjoE3hfw8nMYdQIgjkrbr
-----END CERTIFICATE-----
`;
