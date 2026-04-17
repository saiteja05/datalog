# MongoDB Atlas Security — Defense in Depth

An interactive guide to MongoDB Atlas's five-layer security model — network isolation, encryption, authentication, authorization, and auditing — with code examples and compliance details.

## Purpose

This page helps explain:
- The defense-in-depth security posture of MongoDB Atlas
- Five security layers and how they operate independently
- Encryption options from TLS to CSFLE to Queryable Encryption
- Authentication mechanisms (SCRAM, X.509, LDAP, AWS IAM, OIDC)
- Role-based access control with custom roles and field-level redaction
- Database auditing, SIEM integration, and activity feeds
- Compliance certifications (SOC 2, ISO 27001, HIPAA, PCI DSS, GDPR, FedRAMP)
- The shared responsibility model between Atlas and the customer

---

## Quick Start

1. Open `security.html` in a web browser
2. Use the sticky navigation bar to jump between sections
3. Click security layers in the interactive pentagon to navigate to deep dives
4. Review code examples for Terraform, Queryable Encryption, custom roles, and audit filters
5. Scroll to the compliance grid for certification details

---

## Page Sections

| # | Section | Description |
|---|---------|-------------|
| 1 | **Hero** | Animated particle canvas, defense-in-depth tagline |
| 2 | **Security Posture** | Interactive pentagon diagram linking to 5 security layers, secure-by-default defaults |
| 3 | **Network Security** | VPC isolation, private endpoints, IP access list, VPC peering — with Terraform code |
| 4 | **Encryption** | In transit, at rest, CSFLE, Queryable Encryption — with Python driver example |
| 5 | **Authentication** | SCRAM, X.509, LDAP, AWS IAM, OIDC — with connection string examples |
| 6 | **Authorization** | RBAC, custom roles, field-level redaction, secrets management — with JS code |
| 7 | **Auditing & Monitoring** | Database auditing, activity feed, SIEM integration — with audit filter JSON |
| 8 | **Compliance** | Certification badges: SOC 2, ISO 27001, HIPAA, PCI DSS, GDPR, CSA STAR, FedRAMP, IRAP |
| 9 | **Shared Responsibility** | Two-column "Atlas Manages" vs "You Manage" comparison |

---

## Five Security Layers

| Layer | What It Protects | Key Features |
|-------|-----------------|--------------|
| **Network** | Perimeter access | VPC isolation, Private Endpoints (AWS/Azure/GCP), IP Access List, VPC Peering |
| **Encryption** | Data confidentiality | TLS 1.2+, AES-256 at rest, BYOK, CSFLE, Queryable Encryption |
| **Authentication** | Identity verification | SCRAM, X.509, LDAP/AD, AWS IAM, OIDC/SAML, MFA |
| **Authorization** | Permission control | Built-in roles, Custom roles, Field-level redaction, HashiCorp Vault |
| **Auditing** | Accountability | Database audit logs, Activity feed, SIEM export (Splunk, Guardium) |

---

## Demo Scenarios

### Scenario 1: Security Overview (10 mins)
Goal: High-level security posture for leadership or security teams

1. Start at the Hero section — "defense in depth"
2. Walk through the pentagon diagram — click each layer
3. Highlight the "Secure by Default" panel (TLS, auth, encryption all on by default)
4. Jump to Compliance grid — show relevant certifications

Key Talking Points:
- Atlas is secure by default — no opt-in required for baseline security
- Five independent layers — compromising one never exposes the others
- SOC 2, ISO 27001, HIPAA, PCI DSS certified

### Scenario 2: Encryption Deep Dive (15 mins)
Goal: Address data confidentiality concerns for regulated industries

1. Walk through the four encryption cards (Transit, Rest, CSFLE, Queryable)
2. Show the Queryable Encryption Python code example
3. Explain BYOK with AWS KMS / Azure Key Vault / GCP KMS
4. Jump to Shared Responsibility to clarify who manages keys

Key Talking Points:
- Queryable Encryption lets you run equality and range queries on encrypted data
- Server never sees plaintext — protects against compromised servers and backups
- BYOK gives you full control of encryption keys

### Scenario 3: Network & Access Control (15 mins)
Goal: Satisfy network security and access management requirements

1. Network section — show Terraform code for Private Endpoints and IP Access List
2. Authentication section — walk through connection string examples
3. Authorization section — show custom role creation code
4. Auditing section — show audit filter JSON

Key Talking Points:
- Private endpoints keep traffic on cloud provider backbone
- Multiple auth mechanisms for different use cases (humans vs services)
- Custom roles enable principle of least privilege
- Audit logs integrate with existing SIEM infrastructure

---

## Common Questions

Q: Is Atlas SOC 2 compliant?
A: Yes. SOC 2 Type II audited annually covering security, availability, and confidentiality.

Q: Can I use my own encryption keys?
A: Yes. BYOK is supported via AWS KMS, Azure Key Vault, and GCP KMS.

Q: Does Atlas support HIPAA?
A: Yes. BAA is available. Atlas supports HIPAA-compliant architectures.

Q: How does Queryable Encryption differ from CSFLE?
A: CSFLE encrypts on the client but requires deterministic encryption for queries. Queryable Encryption uses a novel cryptographic scheme allowing both equality and range queries on encrypted data.

Q: Can MongoDB employees access my data?
A: No. Access requires MFA, management approval, is time-limited, and fully logged.

Q: What auth methods work for microservices?
A: AWS IAM (for AWS workloads), X.509 certificates, or OIDC workload identity.

---

## Security Checklist

- [ ] Configure IP Access List (empty by default = no access)
- [ ] Set up Private Endpoints or VPC Peering
- [ ] Create database users with least-privilege custom roles
- [ ] Enable MFA and SSO for Atlas UI access
- [ ] Enable database auditing with appropriate filters
- [ ] Configure BYOK if regulatory requirements demand it
- [ ] Implement CSFLE or Queryable Encryption for sensitive fields
- [ ] Integrate audit logs with your SIEM
- [ ] Schedule regular access permission reviews
- [ ] Set up Atlas alerts for security events

---

## Additional Resources

- MongoDB Trust Center: https://www.mongodb.com/products/platform/trust
- Atlas Network Access: https://www.mongodb.com/docs/atlas/security-whitelist/
- Queryable Encryption: https://www.mongodb.com/docs/manual/core/queryable-encryption/
- CSFLE: https://www.mongodb.com/docs/current/core/csfle/
- Database Users & RBAC: https://www.mongodb.com/docs/atlas/security-add-mongodb-users/
- Database Auditing: https://www.mongodb.com/docs/atlas/database-auditing/
- HashiCorp Vault Integration: https://www.mongodb.com/products/integrations/hashicorp-vault

---

Built for MongoDB Solutions Architecture team
