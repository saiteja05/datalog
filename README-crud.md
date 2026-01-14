# MongoDB CRUD Operations

A comprehensive guide to MongoDB Create, Read, Update, and Delete operations.

## Purpose

This guide helps explain:
- Complete coverage of MongoDB CRUD operations
- Practical code examples with syntax highlighting
- Best practices for each operation type
- Common patterns and anti-patterns
- Query operators and their usage

---

## Quick Start

1. Open crud.html in a web browser
2. Navigate through sections using the headers
3. Copy code examples using the copy button
4. Modify examples for your use case

---

## Operations Covered

### Create Operations
| Method | Description | Use Case |
|--------|-------------|----------|
| insertOne() | Insert single document | Adding one record |
| insertMany() | Bulk insert | Batch data loading |
| bulkWrite() | Mixed operations | Complex batch jobs |

### Read Operations
| Method | Description | Use Case |
|--------|-------------|----------|
| find() | Query documents | General queries |
| findOne() | Single document | By ID lookups |
| aggregate() | Pipeline processing | Analytics, joins |

### Update Operations
| Method | Description | Use Case |
|--------|-------------|----------|
| updateOne() | Update single doc | Targeted updates |
| updateMany() | Update multiple | Bulk modifications |
| replaceOne() | Replace entire doc | Full document swap |

### Delete Operations
| Method | Description | Use Case |
|--------|-------------|----------|
| deleteOne() | Remove single doc | Targeted removal |
| deleteMany() | Remove multiple | Bulk cleanup |

---

## Demo Scenarios

### Scenario 1: Basic CRUD Walkthrough (15 mins)
Goal: Demonstrate fundamental operations

1. Create - Insert sample documents
2. Read - Query with various filters
3. Update - Modify documents in place
4. Delete - Remove documents

Key Talking Points:
- Simple, intuitive API
- JSON-like document structure
- Powerful query operators

---

## Common Questions

Q: What about transactions?
A: MongoDB supports multi-document ACID transactions.

Q: Are operations atomic?
A: Single document operations are always atomic.

Q: What is the document size limit?
A: 16MB per document. Use GridFS for larger files.

---

## Additional Resources

- CRUD Documentation: https://www.mongodb.com/docs/manual/crud/
- Query Operators: https://www.mongodb.com/docs/manual/reference/operator/query/

---

Built for MongoDB Solutions Architecture team
